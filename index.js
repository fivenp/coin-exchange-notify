const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config.json');
const crypto = require('crypto');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync')
const winston = require("winston");
const nodemailer = require('nodemailer');

const algorithm = 'aes-256-ctr';
const password = 'asdnjk4njkerneajkn';

const adapter = new FileSync('./db.json');
const db = low(adapter);

const watchlistAdapter = new FileSync('./db.watchlist.json');
const watchlistDb = low(watchlistAdapter);

const level = process.env.LOG_LEVEL || 'debug';
const base_url = process.env.MONITOR_URL || 'https://coinmarketcap.com/new/';

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      prettyPrint: true,
      colorize: true,
      silent: false,
      // timestamp: false,
      level: level,
      timestamp: function () {
        return (new Date()).toISOString();
      }
    })
  ]
});

db.defaults({ coins: [] }).write()
watchlistDb.defaults({ coins: [] }).write()

// ENCRYPT YOUR PASSWORD HERE AND WATCH THE CONSOLE OUTPUT
// Add the encrypted version to your config.json into the smtp auth pass field
// *****
// console.log(encrypt('MYPASSWORD'));

logger.info('Got Watchlist');
logger.debug(config.watchlist);
logger.info('Grabbing '+base_url);
axios.get(base_url)
  .then( (response) => {
    logger.info('Grabbed page');
    let $ = cheerio.load(response.data);
    let coins = [];
    let matchedCoins = [];
    $('.table tbody tr').each( (i, elm) => {
      let currency = {
        name: $(elm).children().eq(0).find($('a')).text(),
        sign: $(elm).children().eq(1).text(),
        added: $(elm).children().eq(2).text(),
        marketCap: $(elm).children().eq(3).text().replace(/\n/g, '').replace(/ /g, ''),
        price: $(elm).children().eq(4).find($('a')).text(),
        supply: $(elm).children().eq(5).children().text().replace(/\n/g, '').replace(/ /g, ''),
        volume: $(elm).children().eq(6).find($('a')).text(),
        url: 'https://coinmarketcap.com' + $(elm).children().eq(4).find($('a')).attr('href'),
        createdAt: (new Date()).toISOString(),
      }
      if(!db.get('coins').find({ sign: currency.sign }).value()){
        logger.info("Adding currency to DB: "+currency.name);
        logger.warn(currency);
        if(config.watchlist.includes(currency.name) || config.watchlist.includes(currency.sign)){
          logger.info("Currency from watchlist MATCHED: "+currency.name);
          logger.warn(currency);
          matchedCoins.push( currency );
          watchlistDb.get('coins').push(currency).write();
        }
        db.get('coins').push(currency).write();
      }
      coins.push( currency );
    });
    return(matchedCoins);
})
.then ( (matchedCoins) => {
  if(matchedCoins.length > 0){
    logger.info('Matched some coins from your watchlist');
    if(config.mail.active){
      logger.info('Preparing and sending them out')
      // create reusable transporter object using the default SMTP transport
      let transporter = nodemailer.createTransport({
        host: config.mail.smtp.host,
        port: config.mail.smtp.port,
        secure: config.mail.smtp.secure, // true for 465, false for other ports
        auth: {
          user: config.mail.smtp.auth.user,
          pass: decrypt(config.mail.smtp.auth.pass)
        }
      });
      // setup email data with unicode symbols
      let mailOptions = {
        from: config.mail.from,
        to: config.mail.to,
        subject: 'Coin News',
        text: prepareMail(matchedCoins)
      };
      // send mail with defined transport object
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          logger.error(error);
        }
      });
    }
    logger.debug(matchedCoins);
  }

})
.catch(function (error) {
  logger.error(error);
});

function prepareMail(coins){
  let txt = "Got new coins at exchanges:\n";
  txt += "-------------------------------------------------------------\n";
  coins.forEach(function(coin) {
    txt += coin.name + " (" + coin.sign + ") - Added: " + coin.added + " -> " + coin.url + "\n";
    txt += "// Price: " + coin.price + "// MarketCap: " + coin.marketCap + "// Supply: " + coin.supply + "// Volume: " + coin.volume + "\n";
    txt += "-------------------------------------------------------------\n";
  }, this);
  return(txt);
}

function encrypt(text){
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

function decrypt(text){
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}
