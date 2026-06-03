import { useEffect, useState } from 'react';
import { fetchAllTrades, triggerIngest } from '../api';

const PARTY_DOT   = { Democrat: 'bg-blue-500', Republican: 'bg-red-500' };
const TYPE_COLOR  = { purchase: 'text-green-400', sale: 'text-red-400', sale_partial: 'text-orange-400' };

export default function Dashboard() {
  const [trades,    setTrades]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [ingesting, setIngesting] = useState(false);

  useEffect(() => {
    fetchAllTrades()
      .then(r => setTrades(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      const r = await triggerIngest();
      alert(`Ingested: ${r.data.house} house + ${r.data.senate} senate`);
      window.location.reload();
    } finally {
      setIngesting(false);
    }
  };

  const filtered = trades.filter(t =>
    !search ||
    t.representativeName?.toLowerCase().includes(search.toLowerCase()) ||
    t.ticker?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex justify-center items-center h-64 text-gray-400">Loading...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Trade Feed</h1>
          <p className="text-gray-400 text-sm">{trades.length.toLocaleString()} disclosures</p>
        </div>
        <button onClick={handleIngest} disabled={ingesting}
          className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg text-sm">
          {ingesting ? 'Ingesting...' : 'Refresh Data'}
        </button>
      </div>

      <input type="text" placeholder="Search by name or ticker..."
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 mb-4 text-sm
                   focus:outline-none focus:border-green-500" />

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              {['Politician','Ticker','Type','Amount','Transaction Date','Disclosure Date','Chamber']
                .map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.slice(0, 200).map(t => (
              <tr key={t.id} className="hover:bg-gray-900/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${PARTY_DOT[t.party] ?? 'bg-gray-500'}`} />
                    {t.representativeName}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono font-bold">{t.ticker ?? <span className="text-gray-600">—</span>}</td>
                <td className={`px-4 py-3 capitalize font-medium ${TYPE_COLOR[t.tradeType?.toLowerCase()] ?? 'text-gray-400'}`}>
                  {t.tradeType}
                </td>
                <td className="px-4 py-3 text-gray-300">{t.amount}</td>
                <td className="px-4 py-3 text-gray-400">{t.transactionDate}</td>
                <td className="px-4 py-3 text-gray-400">{t.disclosureDate}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    t.chamber === 'HOUSE' ? 'bg-purple-900 text-purple-300' : 'bg-yellow-900 text-yellow-300'}`}>
                    {t.chamber}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}