const Stripe = require('stripe');

exports.handler = async function(event) {
  console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
  console.log('PRICE_ID exists:', !!process.env.STRIPE_PRICE_JD_JOBSEEKER_REPORT);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { analysisResult, successUrl, cancelUrl } = JSON.parse(event.body);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_JD_JOBSEEKER_REPORT,
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        product: 'jobseeker-jd-analysis',
        overall_risk: analysisResult?.overall_risk || 'unknown'
      }
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    console.error('create-jobseeker-checkout error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
