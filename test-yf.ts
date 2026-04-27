import yahooFinance from 'yahoo-finance2';

async function testYF() {
  const syms = ['AAPL', 'TSLA', 'USGOW', 'ESHAR'];
  const quotes = await yahooFinance.quote(syms);
  
  for (const q of quotes) {
    console.log(`\n--- ${q.symbol} ---`);
    console.log('marketCap:', q.marketCap);
    console.log('sharesOutstanding:', q.sharesOutstanding);
    console.log('preMarketPrice:', q.preMarketPrice);
    console.log('preMarketChangePercent:', q.preMarketChangePercent);
    console.log('postMarketPrice:', q.postMarketPrice);
    console.log('regularMarketVolume:', q.regularMarketVolume);
  }

  // test summary
  for (const sym of syms) {
    try {
      const summary = await yahooFinance.quoteSummary(sym, { modules: ['defaultKeyStatistics', 'financialData'] });
      console.log(`\n--- Summary ${sym} ---`);
      console.log('shortPercentOfFloat:', summary.defaultKeyStatistics?.shortPercentOfFloat);
      console.log('floatShares:', summary.defaultKeyStatistics?.floatShares);
    } catch (e: any) {
      console.log(`\n--- Summary ${sym} ERROR ---`, e.message);
    }

    try {
      const search = await yahooFinance.search(sym, { newsCount: 1 });
      console.log(`\n--- Search ${sym} Catalyst ---`);
      console.log('news title:', search.news?.[0]?.title);
    } catch (e: any) {
      console.log(`\n--- Search ${sym} ERROR ---`, e.message);
    }
  }
}

testYF();
