const fs = require('fs');

async function test() {
  const res = await fetch('http://localhost:3000/api/market');
  const marketData = await res.json();
  const gappers = marketData.data || [];
  
  const filterMinGap = 0;
  const filterMinPrice = 0;
  const filterMaxPrice = 1000;
  const filterMinMktCap = 0;
  const filterMinVol = 0;

  const filtered = gappers.filter(g => {
    const gap = parseFloat(g.premktChgPct || '0');
    if (filterMinGap !== 0 && gap < filterMinGap) return false;
    
    if (g.price < filterMinPrice || g.price > filterMaxPrice) return false;
    
    if (filterMinMktCap !== 0 && (g.mktCapRaw || 0) < filterMinMktCap) return false;
    
    if (filterMinVol !== 0 && g.volume < filterMinVol) return false;

    return true;
  });

  console.log(`Total: ${gappers.length}, Filtered: ${filtered.length}`);
  if (filtered.length === 0 && gappers.length > 0) {
    console.log("Sample filtered out gapper:", gappers[0]);
  }
}
test();
