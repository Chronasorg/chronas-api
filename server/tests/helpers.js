const prepare = require('mocha-prepare')
const mongoUnit = require('mongo-unit')

// https://www.toptal.com/nodejs/integration-and-e2e-tests-nodejs-mongodb

prepare(done => mongoUnit.start()
 .then((testMongoUrl) => {
   process.env.MONGO_HOST = testMongoUrl
   done()
 }))

process.env.JWT_SECRET = 'placeholder'
process.env.APPINSIGHTS_INSTRUMENTATIONKEY = 'placeholder'
process.env.TWITTER_CONSUMER_KEY = 'placeholder'
process.env.TWITTER_CONSUMER_SECRET = 'placeholder'
process.env.TWITTER_CALLBACK_URL = 'placeholder'
process.env.MAILGUN_KEY = 'placeholder'
