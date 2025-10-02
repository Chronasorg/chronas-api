import httpStatus from 'http-status';
import { config } from '../../config/config.js';
import nodemailer from 'nodemailer';
import mg from 'nodemailer-mailgun-transport';

// This is your API key that you retrieve from www.mailgun.com/cp (free up to 10K monthly emails)
let nodemailerMailgun;

// Only initialize Mailgun if we have the required config
if (config.mailgunKey && config.mailgunDomain) {
  const auth = {
    auth: {
      api_key: config.mailgunKey,
      domain: config.mailgunDomain
    },
    // proxy: 'http://user:pass@localhost:8080' // optional proxy, default is false
  }
  nodemailerMailgun = nodemailer.createTransport(mg(auth));
} else {
  console.log('⚠️  Mailgun not configured, email functionality disabled');
}

/**
 * get current deployed version
 */
async function create(req, res, doReturn = true) {
  const { from, to = (config.mailgunReceiver || '').split(','), subject, html } = req.body
  if (!from || !to || !subject || !html) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: 'Body does not contain any or all of the following fields: from, to, subject, html'
    })
  }

  // Check if Mailgun is configured
  if (!nodemailerMailgun) {
    if (doReturn) {
      return res.status(httpStatus.SERVICE_UNAVAILABLE).json({
        message: 'Email service not configured'
      })
    }
    return
  }

  const toSendBody = {
    from,
    subject: `[Chronas Contact] ${subject}`,
    html
  }

  if (Array.isArray(to) && to.length === 2) {
    toSendBody.to = to[0]
  } else if (Array.isArray(to)) {
    toSendBody.to = to[0]
  } else {
    toSendBody.to = to
  }

  try {
    const info = await nodemailerMailgun.sendMail(toSendBody);
    if (doReturn) {
      return res.json(info.message);
    }
  } catch (err) {
    if (doReturn) {
      return res.json(err.message);
    }
  }


}

export default { create }
