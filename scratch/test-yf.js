const yahooFinance = require('yahoo-finance2').default;

async function test() {
  try {
    const symbols = ['USGOW', 'ESHAR', 'ORGNW', 'AAPL', 'TSLA'];
    console.log('Fetching quotes for:', symbols);
    const results = await yahooFinance.quote(symbols);
    console.log('Results:', JSON.stringify(results, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
