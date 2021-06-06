
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./spookyswap-sdk.cjs.production.min.js')
} else {
  module.exports = require('./spookyswap-sdk.cjs.development.js')
}
