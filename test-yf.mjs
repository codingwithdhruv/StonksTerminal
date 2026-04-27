import yahooFinance2 from 'yahoo-finance2';
const yahooFinance = typeof yahooFinance2 === 'function' ? new yahooFinance2() : (yahooFinance2.default ? new yahooFinance2.default() : yahooFinance2);

async function testYF() {
  const syms = ['AAPL', 'TSLA', 'USGOW', 'ESHAR'];
  const quotes = await yahooFinance.quote(syms);
  
  for (const q of quotes) {
    console.log(`\n--- ${q.symbol} ---`);
    console.log('preMarketPrice:', q.preMarketPrice);
    console.log('preMarketChangePercent:', q.preMarketChangePercent);
    console.log('postMarketPrice:', q.postMarketPrice);
    console.log('postMarketChangePercent:', q.postMarketChangePercent);
    console.log('regularMarketVolume:', q.regularMarketVolume);
  }
}

testYF();
