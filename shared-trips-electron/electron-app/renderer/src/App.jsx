import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Car, Users, MessageCircle, ArrowLeftRight, MapPin, Check, X, Clock, Calendar, User, PlusCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { io } from "socket.io-client";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:4777/api";

const classNames = (...xs) => xs.filter(Boolean).join(" ");
const Tag = ({ children }) => (<span className="px-2 py-1 rounded-full border text-xs whitespace-nowrap bg-white/70">{children}</span>);
const Pill = ({ icon: Icon, children }) => (<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/70 shadow border text-xs"><Icon size={14} /> {children}</span>);

function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(val)); }, [key, val]);
  return [val, setVal];
}
function FitBounds({ fromCity, toCity }) {
  const map = useMap();
  useEffect(() => { if (fromCity && toCity) map.fitBounds([[fromCity.lat, fromCity.lng], [toCity.lat, toCity.lng]], { padding: [60, 60] }); }, [fromCity, toCity, map]);
  return null;
}

export default function App() {
  const [user, setUser] = useLocalStorage("stbg.user", { id: "u-"+Math.random().toString(16).slice(2), name: "Потребител" });
  const [cities, setCities] = useState([]);
  const [trips, setTrips] = useState([]);
  const [fromName, setFromName] = useState("Sofia");
  const [toName, setToName] = useState("Plovdiv");
  const [dateFilter, setDateFilter] = useState("all");
  const [driverName, setDriverName] = useState("Мирко");
  const [newDate, setNewDate] = useState(""); const [newTime, setNewTime] = useState(""); const [seats, setSeats] = useState(3);
  const [activeTripId, setActiveTripId] = useState(null); const [chatInput, setChatInput] = useState("");
  const socketRef = useRef(null); const [chat, setChat] = useState([]);

  const fromCity = useMemo(() => cities.find(c => c.name === fromName), [cities, fromName]);
  const toCity = useMemo(() => cities.find(c => c.name === toName), [cities, toName]);
  const selectedTrip = useMemo(() => trips.find(t => t.id === activeTripId) || null, [trips, activeTripId]);
  const filteredTrips = useMemo(() => trips.filter(t => (!fromName || t.from === fromName) && (!toName || t.to === toName) && (dateFilter==='all' || t.date===dateFilter)), [trips, fromName, toName, dateFilter]);
  const datesForFilter = useMemo(() => ["all", ...Array.from(new Set(trips.map(t=>t.date))).sort()], [trips]);

  useEffect(() => { fetch(`${API_BASE}/cities`).then(r=>r.json()).then(setCities).catch(()=>{}); }, []);
  useEffect(() => {
    const params = new URLSearchParams(); if (fromName) params.set("from", fromName); if (toName) params.set("to", toName); if (dateFilter!=='all') params.set("date", dateFilter);
    fetch(`${API_BASE}/trips?${params}`).then(r=>r.json()).then(setTrips).catch(()=>setTrips([]));
  }, [fromName, toName, dateFilter]);

  useEffect(() => {
    if (!selectedTrip) return;
    if (!socketRef.current) socketRef.current = io("http://localhost:4777");
    const s = socketRef.current; s.emit('chat:join', selectedTrip.id);
    const handler = (m)=>setChat(prev=>[...prev,m]); s.on('chat:new', handler);
    return ()=>{ s.off('chat:new', handler); s.emit('chat:leave', selectedTrip.id); };
  }, [selectedTrip?.id]);

  useEffect(() => { if (activeTripId) fetch(`${API_BASE}/trips/${activeTripId}/chat`).then(r=>r.json()).then(setChat).catch(()=>setChat([])); }, [activeTripId]);

  async function createTrip(){
    if (!fromName || !toName || !newDate || !newTime) return alert('Попълни От/До/Дата/Час');
    const body = { from: fromName, to: toName, date: newDate, time: newTime, seatsTotal: Number(seats), driver: driverName };
    const r = await fetch(`${API_BASE}/trips`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.json().catch(()=>({})); return alert(e.error||'Грешка при създаване'); }
    alert('Курсът е създаден'); setNewDate(''); setNewTime(''); setSeats(3);
    const params = new URLSearchParams(); if (fromName) params.set("from", fromName); if (toName) params.set("to", toName); if (dateFilter!=='all') params.set("date", dateFilter);
    const data = await fetch(`${API_BASE}/trips?${params}`).then(r=>r.json()); setTrips(data);
  }
  async function requestToJoin(tripId){
    const r = await fetch(`${API_BASE}/trips/${tripId}/request`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: user.id }) });
    if (!r.ok) { const e = await r.json().catch(()=>({})); return alert(e.error||'Грешка'); }
    alert('Заявката е изпратена');
  }
  async function sendChat(){ if (!selectedTrip || !chatInput.trim()) return;
    await fetch(`${API_BASE}/trips/${selectedTrip.id}/chat`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: chatInput.trim(), userId: user.id, userName: user.name }) });
    setChatInput('');
  }

  function seatsLeft(t){ return t.seatsTotal - t.seatsTaken; }

  return (<div className="w-full h-screen flex bg-gradient-to-b from-sky-50 to-slate-50 text-slate-800">
    <div className="w-[400px] border-r bg-white/70 backdrop-blur p-4 flex flex-col gap-3 overflow-y-auto">
      <div className="flex items-center gap-2"><div className="p-2 rounded-2xl bg-sky-100"><Car/></div><div><h1 className="text-xl font-semibold">Споделени пътувания</h1><p className="text-xs text-slate-500">Локално приложение</p></div></div>
      <div className="rounded-2xl border bg-white p-3">
        <div className="grid gap-2">
          <input className="border rounded-xl px-3 py-2" placeholder="Твоето име (за чат)" value={user.name} onChange={e=>setUser({...user, name:e.target.value})} />
          <div className="text-xs text-slate-500">Името се ползва за чат и заявки.</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 items-end">
        <div className="col-span-2"><label className="text-xs">От</label><select className="w-full mt-1 p-2 border rounded-xl" value={fromName} onChange={e=>setFromName(e.target.value)}>{cities.map(c=><option key={c.name}>{c.name}</option>)}</select></div>
        <div className="flex items-center justify-center pb-2"><button onClick={()=>{ const a=fromName; setFromName(toName); setToName(a); }} className="p-2 border rounded-xl hover:bg-slate-50"><ArrowLeftRight/></button></div>
        <div className="col-span-2"><label className="text-xs">До</label><select className="w-full mt-1 p-2 border rounded-xl" value={toName} onChange={e=>setToName(e.target.value)}>{cities.map(c=><option key={c.name}>{c.name}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-xs">Дата</label><select className="w-full mt-1 p-2 border rounded-xl" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}>{datesForFilter.map(d=><option key={d} value={d}>{d==='all'?'Всяка дата':d}</option>)}</select></div>
      </div>
      <div className="rounded-2xl border bg-white p-3">
        <div className="grid gap-2">
          <input className="border rounded-xl px-3 py-2" placeholder="Твоето име (шофьор)" value={driverName} onChange={e=>setDriverName(e.target.value)} />
          <input className="border rounded-xl px-3 py-2" placeholder="Дата YYYY-MM-DD" value={newDate} onChange={e=>setNewDate(e.target.value)} />
          <input className="border rounded-xl px-3 py-2" placeholder="Час HH:MM" value={newTime} onChange={e=>setNewTime(e.target.value)} />
          <input className="border rounded-xl px-3 py-2" type="number" min={1} max={8} value={seats} onChange={e=>setSeats(Number(e.target.value))} />
          <button onClick={createTrip} className="px-3 py-2 rounded-xl border bg-sky-50 flex items-center gap-1"><PlusCircle size={16}/> Създай курс</button>
        </div>
      </div>
      <div className="mt-auto text-xs text-slate-400">{filteredTrips.length} курса</div>
    </div>
    <div className="flex-1 grid grid-rows-[1fr, minmax(220px, 40%)]">
      <div className="relative">
        <MapContainer center={[42.6977, 23.3219]} zoom={7} className="h-full w-full" scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          {cities.map(c => (<CircleMarker key={c.name} center={[c.lat, c.lng]} radius={6} pathOptions={{ color: c.name===fromName?'#0ea5e9': c.name===toName?'#22c55e':'#334155', weight: 2 }}>
              <Popup><div className="text-sm font-medium flex items-center gap-2"><MapPin size={16} /> {c.name}</div></Popup>
            </CircleMarker>))}
          {fromCity && toCity && (<Polyline positions={[[fromCity.lat, fromCity.lng],[toCity.lat, toCity.lng]]} pathOptions={{ weight: 5, opacity: 0.6 }} />)}
          <FitBounds fromCity={fromCity} toCity={toCity} />
        </MapContainer>
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
          <Pill icon={MapPin}>От: {fromName}</Pill>
          <Pill icon={MapPin}>До: {toName}</Pill>
          <Pill icon={Calendar}>Дата: {dateFilter === "all" ? "Всяка" : dateFilter}</Pill>
        </div>
      </div>
      <div className="border-t bg-white/80 backdrop-blur grid grid-cols-2 gap-0">
        <div className="p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Налични курсове</h2>
            <span className="text-xs text-slate-500">Двоен клик за заявка</span>
          </div>
          <div className="grid gap-3">
            {filteredTrips.map(t => {
              const left = seatsLeft(t);
              return (
                <motion.div key={t.id} layout onDoubleClick={() => requestToJoin(t.id)} className={`rounded-2xl border p-3 bg-white shadow-sm cursor-pointer transition ${activeTripId===t.id?"ring-2 ring-sky-300":""}`} onClick={() => setActiveTripId(t.id)}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-sky-50 border"><Car /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{t.from}</span><span className="text-slate-400">→</span><span className="font-medium">{t.to}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-600 mt-1">
                        <span className="inline-flex items-center gap-1"><Calendar size={14}/> {t.date}</span>
                        <span className="inline-flex items-center gap-1"><Clock size={14}/> {t.time}</span>
                        <span className="inline-flex items-center gap-1"><User size={14}/> {t.driver}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end text-sm font-medium"><Users size={16}/> {left} свободни</div>
                      <div className="text-xs text-slate-500">{t.seatsTotal} общо</div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
        <div className="border-l p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><MessageCircle/> Чат</h2>
            {selectedTrip ? (<div className="text-xs text-slate-500">{selectedTrip.from} → {selectedTrip.to} · {selectedTrip.date} {selectedTrip.time}</div>) : <div className="text-xs text-slate-500">Избери курс</div>}
          </div>
          <div className="mt-2 flex-1 overflow-y-auto rounded-xl border bg-white p-3">
            {selectedTrip ? (
              chat.length ? (<div className="space-y-2"><AnimatePresence>{chat.map(m => (
                <motion.div key={m.id} initial={{opacity:0, y:6}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-6}}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow ${m.userId===user?.id?"ml-auto bg-sky-50 border":"bg-slate-50 border"}`}>
                    <div className="text-[11px] text-slate-500 mb-0.5">{m.userName || (m.userId===user?.id? 'Ти' : 'Потребител')}</div>
                    <div>{m.text}</div>
                  </div>
                </motion.div>
              ))}</AnimatePresence></div>) : (<div className="h-full grid place-items-center text-slate-400 text-sm">Още няма съобщения</div>)
            ) : (<div className="h-full grid place-items-center text-slate-400 text-sm">Няма избран курс</div>)}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="flex-1 border rounded-xl px-3 py-2" placeholder={selectedTrip? "Напиши съобщение…" : "Избери курс"} value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{ if (e.key === 'Enter') sendChat(); }} disabled={!selectedTrip} />
            <button className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50" onClick={sendChat} disabled={!selectedTrip}>Изпрати</button>
          </div>
        </div>
      </div>
    </div>
  );}
