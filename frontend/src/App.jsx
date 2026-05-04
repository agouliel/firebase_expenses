import { useState, useEffect } from 'react';
import { signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { auth, provider } from "./firebaseConfig";

function App() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedCell, setSelectedCell] = useState(null); // { cat, month, monthName }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLoginAndSetup = async () => {
    const googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    googleProvider.setCustomParameters({ access_type: 'offline', prompt: 'consent' });

    try {
      const result = await signInWithPopup(auth, googleProvider);

      const idToken = await result.user.getIdToken();

      const tokens = {
        access_token: result._tokenResponse.oauthAccessToken,
        refresh_token: result._tokenResponse.refreshToken,
        expiry_date: Date.now() + (result._tokenResponse.oauthExpireIn * 1000)
      };

      await fetch("http://localhost:5001/api/save-calendar-token", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ tokens })
      });

      setUser(result.user);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const fetchCalendar = async (yearOverride) => {
    const year = yearOverride ?? selectedYear;
    setLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(`http://localhost:5001/api/calendar?year=${year}`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      setEvents(data);
      setSelectedCell(null);
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleYearChange = (e) => {
    const year = parseInt(e.target.value);
    setSelectedYear(year);
    if (events) fetchCalendar(year);
  };

  const handleCellClick = (cat, month, monthName) => {
    const key = `${cat}|${month}`;
    const items = events.expense_map[key];
    if (!items || items.length === 0) return;
    if (selectedCell && selectedCell.cat === cat && selectedCell.month === month) {
      setSelectedCell(null);
    } else {
      setSelectedCell({ cat, month, monthName });
    }
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i);

  const sidebarItems = selectedCell
    ? (events?.expense_map[`${selectedCell.cat}|${selectedCell.month}`] ?? [])
    : [];

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Google Calendar Integration</h1>

      {!user ? (
        <button onClick={handleLoginAndSetup}>Login & Authorize Calendar</button>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={user.photoURL} width="40" style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
            <p>Welcome, {user.displayName}</p>
            <select value={selectedYear} onChange={handleYearChange} disabled={loading}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => fetchCalendar()} disabled={loading}>
              {loading ? "Loading..." : "Show My Calendar"}
            </button>
            <button onClick={() => signOut(auth)}>Sign out</button>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            <div>
              <h3>Expenses:</h3>
              {events ? (
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      {events.months.map(([num, name]) => <th key={num}>{name}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(events.pivot).sort((a, b) => a.localeCompare(b)).map(cat => (
                      <tr key={cat}>
                        <td>#{cat}</td>
                        {events.months.map(([m, name]) => {
                          const amount = events.pivot[cat][m];
                          const hasItems = amount > 0 && events.expense_map[`${cat}|${m}`]?.length > 0;
                          const isSelected = selectedCell?.cat === cat && selectedCell?.month === m;
                          return (
                            <td
                              key={m}
                              onClick={hasItems ? () => handleCellClick(cat, m, name) : undefined}
                              style={{
                                cursor: hasItems ? 'pointer' : 'default',
                                background: isSelected ? '#dbeafe' : undefined,
                                fontWeight: isSelected ? 'bold' : undefined,
                                textDecoration: hasItems ? 'underline' : undefined,
                                color: hasItems ? '#1d4ed8' : undefined,
                              }}
                            >
                              {amount > 0 ? `€${amount}` : '-'}
                            </td>
                          );
                        })}
                        <td><strong>€{events.totals_by_category[cat]}</strong></td>
                      </tr>
                    ))}
                    <tr>
                      <td><strong>Total</strong></td>
                      {events.months.map(([m]) => (
                        <td key={m}>
                          <strong>{events.totals_by_month[m] > 0 ? `€${events.totals_by_month[m]}` : '-'}</strong>
                        </td>
                      ))}
                      <td><strong>€{Object.values(events.totals_by_category).reduce((s, v) => s + v, 0)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p>No events found or button not clicked yet.</p>
              )}
            </div>

            {selectedCell && (
              <div style={{
                minWidth: '280px',
                maxWidth: '360px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                background: '#f8fafc',
                position: 'sticky',
                top: '20px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0 }}>#{selectedCell.cat} — {selectedCell.monthName}</h4>
                  <button
                    onClick={() => setSelectedCell(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sidebarItems.map(item => (
                    <li key={item.id} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 'bold' }}>€{item.amount}</span>
                        <span style={{ color: '#64748b', fontSize: '13px' }}>{item.date_start ?? item.date}</span>
                      </div>
                      <div style={{ marginTop: '2px' }}>
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '14px' }}>
                            {item.summary || '(no description)'}
                          </a>
                        ) : (
                          <span style={{ fontSize: '14px' }}>{item.summary || '(no description)'}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: '12px', fontWeight: 'bold', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                  Total: €{sidebarItems.reduce((s, i) => s + i.amount, 0).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
