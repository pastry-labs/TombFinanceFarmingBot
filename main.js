const config = require("./config.json");
const networkId = config.networkId;
const networkRPC = config.networkRPC;
const networkName = config.networkName;
const privateKey = config.privateKey;
const user_address = config.userAddress;
const harvestThreshold = config.harvestThreshold;
const slipTolerance = config.slipTolerance;

const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require('web3');
const provider = new HDWalletProvider(privateKey, networkRPC, 0, 2);
const web3 = new Web3(provider);

const OracleContractAddress = web3.utils.toChecksumAddress(config.oracleContractAddress);
const TombRewardPoolAddress = web3.utils.toChecksumAddress(config.tombRewardPoolAddress);
const SpookyRouterAddress = web3.utils.toChecksumAddress(config.spookyRouterAddress);
const TombTokenAddress = web3.utils.toChecksumAddress(config.tombTokenAddress);

const { Percent, ChainId, Fetcher, WETH, Route, Trade, Token, TokenAmount, TradeType } = require ('./spookyswap-sdk/dist');
const BigNumber = require('bignumber.js');
const providers = require('@ethersproject/providers');
const TombRewardPoolABI = require('./abis/TombRewardPool.json');
const OracleContractABI = require('./abis/TombOracle.json');
const SpookyRouterABI = require('./abis/SpookyRouter.json');
const TombTokenABI = require('./abis/TombToken.json');
const coinPriceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${networkName}&vs_currencies=usd`

var localProvider = new providers.JsonRpcProvider(networkRPC);
var request = require("request-promise");
var Promise = require("bluebird");
var lastCoinPrice = 0;
var coinName = "fantom";

function getSpookySwapOutputPrice( amountIn, path ) {
	const spookyRouterContract = new web3.eth.Contract(
		SpookyRouterABI,
		SpookyRouterAddress
	);
		
	return spookyRouterContract.methods.getAmountsOut( BigNumber( amountIn ), path ).call();
}

function getPairReservesData( tokenOne, tokenTwo ) {
	return Fetcher.fetchPairData( tokenOne, tokenTwo, localProvider);
}

function refreshStatus() {
	console.log("-".repeat(45));
	
	const TombRewardPoolContract = new web3.eth.Contract(
		TombRewardPoolABI,
		TombRewardPoolAddress
	);
	
	const oracleContract = new web3.eth.Contract(
		OracleContractABI,
		OracleContractAddress
	);
	
	return request.get({ url: coinPriceUrl, json: true })
		.then( priceData => {
			return TombRewardPoolContract.methods.pendingTOMB(0, user_address).call()
				.then( pendingTomb => {
					return oracleContract.methods.twap(TombTokenAddress, '1000000000000000000').call()
						.then((priceInCoin) => {
							var pendingTombParsed = parseFloat( pendingTomb / 1e18 ).toFixed(4);
							pendingTombParsed = parseFloat(pendingTombParsed)
							
							if(pendingTombParsed >= harvestThreshold) {
								console.log("[Harvester] Harvesting pool 0...")
								return harvestTombPoolZero()
							} else {
								var priceInUSD = parseFloat( priceInCoin / 1e18 ).toFixed(2);
								lastCoinPrice = parseFloat( priceData[coinName].usd )
								priceInUSD = parseFloat( priceInUSD ) * lastCoinPrice
								console.log(`${new Date()} | ${pendingTombParsed} TOMB claimable (threshold = ${harvestThreshold})`)
							}
						})
				})
		})
		.then( () => {
			const tombTokenContract = new web3.eth.Contract(
				TombTokenABI,
				TombTokenAddress
			)
			
			return tombTokenContract.methods.balanceOf( user_address ).call()
				.then( balanceData => {
					if(balanceData != 0) {
						return createSpookySwapTrade(balanceData);
					}
					
					return Promise.try(() => true);
				})
		})
}

function createSpookySwapTrade( amountIn ) {
	var weth = WETH[networkId]
	var tombToken = new Token(networkId, TombTokenAddress, 18, 'TOMB', 'TOMB');
	return getPairReservesData( tombToken, weth )
		.then( pair => {
			var spookySwapTransaction = {
				amountIn: BigNumber(amountIn),
				amountOutMin: null,
				path: [
					tombToken.address,
					weth.address
				],
				to: user_address,
				deadline: null
			};
			
			var slippageTolerance = new Percent(slipTolerance, '10000'); // 3.0%
			
			//swapExactTokensForETHSupportingFeeOnTransferTokens: amountIn, amountOutMin, path, to, deadline
			return web3.eth.getBlockNumber()
				.then( blockNumber => {
					return web3.eth.getBlock(blockNumber);
				})
				.then( blockData => {
					var route = new Route([pair], tombToken);
					var trade = new Trade(route, new TokenAmount(tombToken, BigNumber(spookySwapTransaction.amountIn).toFixed(0)), TradeType.EXACT_INPUT);
					
					spookySwapTransaction.deadline = blockData.timestamp + 1200;
					spookySwapTransaction.amountOutMin = trade.minimumAmountOut(slippageTolerance).raw.toString()
					
					var priceInUSD = parseFloat( spookySwapTransaction.amountOutMin / 1e18 ).toFixed(2);
					priceInUSD = parseFloat( lastCoinPrice ) * priceInUSD;
					
					console.log(`[Trader] ${BigNumber(spookySwapTransaction.amountIn).dividedBy(1e18)} TOMB for ${BigNumber(spookySwapTransaction.amountOutMin).dividedBy(1e18)} FTM ($${ priceInUSD })`)
					
					return sendSpookySwapTrade( spookySwapTransaction )
				})
			
		})
}

function sendSpookySwapTrade( spookySwapTransaction ) {
	const spookyRouterContract = new web3.eth.Contract(
		SpookyRouterABI,
		SpookyRouterAddress
	);
	
	const tx = spookyRouterContract.methods.swapExactTokensForETHSupportingFeeOnTransferTokens(
		spookySwapTransaction.amountIn,
		spookySwapTransaction.amountOutMin,
		spookySwapTransaction.path,
		spookySwapTransaction.to,
		spookySwapTransaction.deadline
	);
	
	return tx.estimateGas({from: user_address})
		.then(gas => {
			return web3.eth.getGasPrice()
				.then(gasPrice => {
					const data = tx.encodeABI();
					return web3.eth.getTransactionCount(user_address)
						.then(nonce => {
							const txData = {
								from: user_address,
								to: SpookyRouterAddress,
								data: data,
								gas,
								gasPrice,
								nonce, 
								chainId: networkId
							};


							return web3.eth.sendTransaction(txData)
								.then( receipt => {			
									console.log(`[Trader] Success!`);
								})
						})
				})
		}).catch(err => {
			console.log("[Trader] Error!")
			console.error(err)
			throw err;
		})
}

function harvestTombPoolZero() {
	const TombRewardPoolContract = new web3.eth.Contract(
		TombRewardPoolABI,
		TombRewardPoolAddress
	);
	
	const tx = TombRewardPoolContract.methods.withdraw(0, 0);
	return tx.estimateGas({from: user_address})
		.then(gas => {
			return web3.eth.getGasPrice()
				.then(gasPrice => {
					const data = tx.encodeABI();
					return web3.eth.getTransactionCount(user_address)
						.then(nonce => {
							const txData = {
								from: user_address,
								to: TombRewardPoolAddress,
								data: data,
								gas,
								gasPrice,
								nonce, 
								chainId: networkId
							};


							return web3.eth.sendTransaction(txData)
								.then( receipt => {
									console.log("[Harvester] Success!")
								})
						})
				})
		}).catch(err => {
			console.log("[Harvester] Error!")
			console.error(err)
			throw err;
		})
}

web3.eth.accounts.wallet.add(privateKey);

var intervalCheck = setInterval(refreshStatus, 60000)

refreshStatus()
