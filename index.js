require('dotenv').config();
const { Telegraf } = require('telegraf');
const schedule = require('node-schedule');
const moment = require('moment-timezone');
const puppeteer = require('puppeteer');
const { createWorker } = require('tesseract.js');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_IDS = ['5844415850', '7758779789'];

// Authentication middleware
const authMiddleware = (ctx, next) => {
  if (ADMIN_IDS.includes(ctx.from.id.toString())) {
    return next();
  }
  return ctx.reply('Unauthorized access.');
};

async function performLogin(ctx = null) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    if (ctx) await ctx.reply('Starting login process...');

    // Navigate to login page
    await page.goto('https://sharekonnect.sharekhan.com/');
    if (ctx) await ctx.reply('Accessed website');

    // Fill login details
    await page.type('#code', 'SHAREKHAN');
    await page.type('#userId', '39466');
    await page.type('#password', 'Achiadi@123');
    if (ctx) await ctx.reply('Filled login credentials');

    // Handle CAPTCHA
    const captchaImg = await page.$('.captcha-image');
    const screenshot = await captchaImg.screenshot();
    
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(screenshot);
    await worker.terminate();

    const captchaText = text.replace(/[^a-zA-Z0-9]/g, '');
    await page.type('#captcha', captchaText);
    if (ctx) await ctx.reply('Processed and filled CAPTCHA');

    // Click login button
    await page.click('#loginBtn');
    await page.waitForNavigation();
    if (ctx) await ctx.reply('Logged in successfully');

    // Click "Work from Home" button
    await page.waitForSelector('#wfhBtn');
    await page.click('#wfhBtn');
    if (ctx) await ctx.reply('Clicked Work from Home button');

    await browser.close();
    logger.info('Login successful');
    if (ctx) await ctx.reply('Task completed successfully! ✅');
    
  } catch (error) {
    logger.error('Login failed:', error);
    if (ctx) await ctx.reply(`Error occurred: ${error.message}`);
    await browser.close();
  }
}

// Command to manually trigger login
bot.command('login', authMiddleware, async (ctx) => {
  await ctx.reply('Manual login triggered');
  await performLogin(ctx);
});

// Schedule daily login
const scheduleLogin = () => {
  // Schedule for 9:30 AM IST every day except Sunday
  const rule = new schedule.RecurrenceRule();
  rule.tz = 'Asia/Kolkata';
  rule.hour = 9;
  rule.minute = 30;
  rule.dayOfWeek = [1, 2, 3, 4, 5, 6]; // Monday to Saturday

  schedule.scheduleJob(rule, async () => {
    // Check if it's a public holiday (you'll need to implement this)
    if (!isPublicHoliday()) {
      logger.info('Starting scheduled login');
      await performLogin();
    }
  });
};

// Helper function to check for public holidays
function isPublicHoliday() {
  // Implement holiday checking logic here
  // You can use a holiday API or maintain a list of holidays
  return false;
}

// Start bot and scheduler
bot.launch().then(() => {
  logger.info('Bot started');
  scheduleLogin();
}).catch(error => {
  logger.error('Bot failed to start:', error);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));