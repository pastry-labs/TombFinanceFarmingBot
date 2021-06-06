# Tomb ⚰️ Finance 💸 Farming 🚜 Bot 🤖

Just a general purpose farm-then-dump bot for pool 0.

This script assumes you already have token spending approvals for TOMB on Spookyswap & Tomb Finance

Tomb Cemetery Pool 0: https://tomb.finance/cemetery/TombFtmLpTombRewardPool

## Installation

Use the package manager [npm](https://www.npmjs.com/get-npm) to install this bot's dependencies using the following command.

```bash
 npm install
```

## Usage

Modify the [config.json](../blob/main/config.json) with your wallet address and private key.
Optionally, change the harvestThreshold based on how often you want to dump rewards.
slipTolerance is set to 3.0% and may need to be changed depending on TOMB's peg
```json
"privateKey": "NOT_YOUR_MNEMONIC_PHRASE",
"userAddress": "YOUR_WALLET_ADDRESS",
"harvestThreshold": 0.125,
"slipTolerance": "300",
```

**I would advise using a seperate wallet for bot this unless you trust me with your funds ❤️🎂**

Start the farming script
```bash
 npm start
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT LICENSE](../blob/main/LICENSE)
