import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Bell, CalendarClock, Check, ChevronDown, ChefHat, CircleDollarSign,
  Clock3, Download, Edit3, LayoutDashboard, LoaderCircle, LogOut, Mail, Menu as MenuIcon,
  Minus, NotebookText, PackageCheck, Plus, ReceiptText, Search, ShoppingBag, Sparkles,
  Trash2, UtensilsCrossed, X,
  UserRound, SlidersHorizontal, Flame, Leaf, ShieldCheck, UserPlus,
} from 'lucide-react';
import { createFirebaseAccount, isFirebaseConfigured, signInWithFirebase } from './firebase';

type Role = 'CLIENT' | 'ADMIN';
type Status = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'PICKED_UP';
type User = { id: number; name: string; email: string; role: Role };
type MenuOption = { id: number; label: string; price_cents: number };
type MenuItem = { id: number; name: string; description: string; price_cents: number; category: string; is_available: number; quantity_mode: 'COUNT'|'PORTION'; options: MenuOption[] };
type OrderItem = { id: number; menu_item_id: number; item_name: string; variant_label: string; quantity: number; price_at_order_cents: number };
type Order = {
  id: number; client_id: number; client_name: string; client_email: string; status: Status;
  pickup_time: string; requested_date: string; pickup_assigned: number; notes: string; created_at: string; updated_at: string;
  subtotal_cents: number; tax_cents: number; total_cents: number; receipt_id?: number; receipt_sent_at?: string; items: OrderItem[];
};
type Profile = { id:number; name:string; email:string; role:Role; phone:string; food_preference:'NONE'|'VEGETARIAN'|'VEGAN'|'JAIN'; allergies:string; spice_level:'MILD'|'MEDIUM'|'HOT'|'EXTRA_HOT' };
type CartLine = { key:string; menuItemId:number; name:string; optionId?:number; variantLabel:string; price_cents:number; quantity:number };

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const date = (value: string) => new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const statusLabel: Record<Status, string> = { PENDING: 'Pending', IN_PROGRESS: 'In progress', READY: 'Ready', PICKED_UP: 'Picked up' };

async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(path, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (response.status === 401 && retry && path !== '/api/auth/login' && path !== '/api/auth/refresh') {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refreshed.ok) return api<T>(path, options, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed.' }));
    throw new Error(body.error || 'Request failed.');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function Brand({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const content = <><span className="brand-mark"><Sparkles size={18} /></span>{!compact && <span>Rasoi</span>}</>;
  return onClick ? <button className="brand brand-button" aria-label="Go to home" onClick={onClick}>{content}</button> : <div className="brand">{content}</div>;
}

function Button({ children, variant = 'primary', busy, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean }) {
  return <button className={`button ${variant}`} disabled={busy || props.disabled} {...props}>{busy ? <LoaderCircle className="spin" size={18} /> : children}</button>;
}

function EmptyState({ icon: Icon, title, copy }: { icon: typeof ShoppingBag; title: string; copy: string }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24} /></div><h3>{title}</h3><p>{copy}</p></div>;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const id = setTimeout(onClose, 3500); return () => clearTimeout(id); }, [message, onClose]);
  return <div className="toast"><Check size={18} />{message}<button aria-label="Close" onClick={onClose}><X size={16} /></button></div>;
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [name,setName]=useState('');
  const [email, setEmail] = useState('client@rasoi.test');
  const [password, setPassword] = useState('Client123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      if(mode==='signup'){
        const idToken=await createFirebaseAccount(name,email,password);
        const result=await api<{user:User}>('/api/auth/firebase',{method:'POST',body:JSON.stringify({idToken,name})});onLogin(result.user);
      }else if(isFirebaseConfigured&&!email.endsWith('@rasoi.test')){
        const idToken=await signInWithFirebase(email,password);
        const result=await api<{user:User}>('/api/auth/firebase',{method:'POST',body:JSON.stringify({idToken})});onLogin(result.user);
      }else{
        const result = await api<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); onLogin(result.user);
      }
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  };
  const useDemo = (role: Role) => {
    setEmail(role === 'ADMIN' ? 'admin@rasoi.test' : 'client@rasoi.test');
    setPassword(role === 'ADMIN' ? 'Admin123!' : 'Client123!');
  };
  return <main className="login-page minimal-login">
    <div className="login-backdrop-mark"><div className="bowl-art"><div className="rice"/><div className="leaf one"/><div className="leaf two"/><div className="sauce"/></div></div>
    <section className="login-panel">
      <div className="login-card">
        <div className="login-brand"><Brand /></div>
        <span className="eyebrow">{mode==='signin'?'Welcome back':'Join the table'}</span><h2>{mode==='signin'?'Sign in to Rasoi':'Create an account'}</h2><p className="subtle">{mode==='signin'?'Your next meal is only a few taps away.':'Save preferences, orders, invoices, and receipts.'}</p>
        <form onSubmit={submit}>
          {mode==='signup'&&<label>Full name<input value={name} onChange={e=>setName(e.target.value)} minLength={2} autoComplete="name" required /></label>}
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required /></label>
          {error && <div className="form-error">{error}</div>}
          <Button type="submit" busy={busy}>{mode==='signin'?'Sign in':'Create account'} <ArrowRight size={18} /></Button>
        </form>
        {mode==='signin'&&<><div className="demo-divider"><span>Demo accounts</span></div><div className="demo-actions"><button onClick={() => useDemo('CLIENT')}><ShoppingBag size={17} /> Client</button><button onClick={() => useDemo('ADMIN')}><LayoutDashboard size={17} /> Admin</button></div></>}
        <button className="create-account-link" type="button" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('')}}>{mode==='signin'?<><UserPlus size={16}/> Create a new account <span>{isFirebaseConfigured?'Firebase enabled':'Firebase setup needed'}</span></>:<><ArrowRight size={16} className="back-arrow"/> Back to sign in</>}</button>
        <p className="security-note">Protected by encrypted, httpOnly session cookies.</p>
      </div>
    </section>
  </main>;
}

function ClientPortal({ user, onLogout, onUserUpdated }: { user: User; onLogout: () => void; onUserUpdated: (user:User)=>void }) {
  const [view, setView] = useState<'menu' | 'orders' | 'profile'>('menu');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
  const [justAdded, setJustAdded] = useState('');
  const [category, setCategory] = useState('All');
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, o] = await Promise.all([api<{ menu: MenuItem[] }>('/api/menu'), api<{ orders: Order[] }>('/api/orders')]);
      setMenu(m.menu); setOrders(o.orders);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const categories = ['All', ...new Set(menu.map(item => item.category))];
  const cartCount = Object.values(cart).reduce((a, line) => a + line.quantity, 0);
  const add = (item: MenuItem, delta = 1, option?: MenuOption) => {
    const selected = option || item.options.find(o=>o.id===selectedOptions[item.id]) || item.options[0];
    const key = `${item.id}:${selected?.id || 0}`;
    setCart(current => {
      const existing=current[key]; const quantity=Math.max(0,(existing?.quantity||0)+delta);
      if(!quantity){const next={...current};delete next[key];return next}
      return {...current,[key]:{key,menuItemId:item.id,name:item.name,optionId:selected?.id,variantLabel:selected?.label||'Each',price_cents:selected?.price_cents??item.price_cents,quantity}};
    });
    if(delta>0){setJustAdded(key);window.setTimeout(()=>setJustAdded(''),650)}
  };
  const changeCart = (key:string,delta:number) => setCart(current=>{const line=current[key];if(!line)return current;const quantity=Math.max(0,line.quantity+delta);if(!quantity){const next={...current};delete next[key];return next}return{...current,[key]:{...line,quantity}}});
  const cartItems = Object.values(cart);
  const handlePlaced = async () => { setCart({}); setCartOpen(false); setView('orders'); setToast('Order placed — we’ll see you soon.'); await load(); };
  return <div className="portal client-portal">
    <header className="topbar"><Brand onClick={()=>setView('menu')} /><nav><button className={view === 'menu' ? 'active' : ''} onClick={() => setView('menu')}>Menu</button><button className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}>My orders</button></nav><div className="top-actions"><button className={`cart-button ${justAdded?'bump':''}`} onClick={() => setCartOpen(true)} aria-label="Open cart"><ShoppingBag size={19} /><span>{cartCount}</span></button><button className="user-chip user-chip-button" onClick={()=>setView('profile')} aria-label="Open my profile"><span>{user.name.split(' ').map(n => n[0]).join('').slice(0,2)}</span><div><strong>{user.name}</strong><small>Profile & settings</small></div></button><button className="icon-button" onClick={onLogout} aria-label="Sign out"><LogOut size={19} /></button></div></header>
    {view === 'menu' ? <main className="client-main">
      <section className="welcome"><div><span className="eyebrow">Tomorrow’s kitchen</span><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}.</h1><p>Choose tomorrow’s meal. We’ll assign your pickup time.</p></div><div className="pickup-note"><CalendarClock size={20}/><span><strong>Next-day pickup</strong><small>Time confirmed by the kitchen</small></span></div></section>
      <div className="category-strip">{categories.map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
      {loading ? <div className="loading-grid">{[1,2,3,4,5,6].map(i => <div className="skeleton" key={i}/>)}</div> : <section className="menu-grid">{menu.filter(item => category === 'All' || item.category === category).map((item, index) => {const selected=item.options.find(o=>o.id===selectedOptions[item.id])||item.options[0];const key=`${item.id}:${selected?.id||0}`;const quantity=cart[key]?.quantity||0;return <article className={`menu-card tone-${index % 5} ${justAdded===key?'added':''}`} key={item.id}>
        <div className="dish-visual"><span>{item.category}</span><div className="dish"><i/><i/><i/></div>{!item.is_available && <b>Sold out</b>}</div>
        <div className="menu-card-body"><div><h3>{item.name}</h3><p>{item.description}</p></div>{item.quantity_mode==='PORTION'&&<div className="portion-picker" aria-label={`${item.name} size`}>{item.options.map(option=><button className={selected?.id===option.id?'active':''} onClick={()=>setSelectedOptions(s=>({...s,[item.id]:option.id}))} key={option.id}>{option.label}</button>)}</div>}<footer><strong>{money(selected?.price_cents??item.price_cents)}{item.quantity_mode==='COUNT'&&<small> each</small>}</strong>{quantity?<div className="card-quantity"><button onClick={()=>add(item,-1,selected)}><Minus size={14}/></button><span>{quantity}</span><button onClick={()=>add(item,1,selected)} aria-label={`Add another ${item.name}`}><Plus size={14}/></button></div>:<button disabled={!item.is_available} onClick={() => add(item,1,selected)} aria-label={`Add ${item.name}`}><Plus size={19}/></button>}</footer></div>
      </article>})}</section>}
    </main> : view==='orders' ? <OrdersView orders={orders} loading={loading} onUpdated={load} onToast={setToast} /> : <ProfileView user={user} onUserUpdated={onUserUpdated} onToast={setToast}/>} 
    {cartOpen && <CartDrawer items={cartItems} onChange={changeCart} onClose={() => setCartOpen(false)} onPlaced={handlePlaced} />}
    {toast && <Toast message={toast} onClose={() => setToast('')} />}
    <nav className="mobile-nav"><button className={view === 'menu' ? 'active' : ''} onClick={() => setView('menu')}><UtensilsCrossed size={20}/><span>Menu</span></button><button className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}><ReceiptText size={20}/><span>Orders</span></button><button onClick={() => setCartOpen(true)}><ShoppingBag size={20}/><span>Bag ({cartCount})</span></button><button className={view==='profile'?'active':''} onClick={()=>setView('profile')}><UserRound size={20}/><span>Profile</span></button></nav>
  </div>;
}

function CartDrawer({ items, onChange, onClose, onPlaced }: { items: CartLine[]; onChange: (key: string, delta: number) => void; onClose: () => void; onPlaced: () => void }) {
  const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const subtotal = items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0); const tax = Math.round(subtotal * 0.0825);
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const place = async () => { setBusy(true); setError(''); try { await api('/api/orders', { method: 'POST', body: JSON.stringify({ notes, items: items.map(item => ({ menuItemId: item.menuItemId, optionId:item.optionId, quantity: item.quantity })) }) }); onPlaced(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not place order.'); } finally { setBusy(false); } };
  return <div className="drawer-layer" role="dialog" aria-modal="true"><div className="drawer-backdrop" onClick={onClose}/><aside className="cart-drawer"><header><div><span className="eyebrow">Your order</span><h2>Bag <span>{items.reduce((a,i)=>a+i.quantity,0)} items</span></h2></div><button className="icon-button" onClick={onClose}><X size={20}/></button></header>
    <div className="cart-content">{items.length === 0 ? <EmptyState icon={ShoppingBag} title="Your bag is empty" copy="Add something delicious from tomorrow’s menu." /> : <>{items.map(item => <div className="cart-line" key={item.key}><div><strong>{item.name}</strong><small>{item.variantLabel} · {money(item.price_cents)}</small></div><div className="quantity"><button onClick={()=>onChange(item.key,-1)}><Minus size={15}/></button><span>{item.quantity}</span><button onClick={()=>onChange(item.key,1)}><Plus size={15}/></button></div><b>{money(item.price_cents*item.quantity)}</b></div>)}
      <div className="next-day-card"><CalendarClock size={20}/><div><strong>Pickup {tomorrow.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'})}</strong><small>The kitchen will assign and confirm your exact time.</small></div></div><div className="order-fields"><label><NotebookText size={17}/> Notes for the kitchen<textarea value={notes} maxLength={500} onChange={e=>setNotes(e.target.value)} placeholder="Allergies, spice preference, or anything else…" /></label></div>
      <div className="totals"><p><span>Subtotal</span><span>{money(subtotal)}</span></p><p><span>Tax</span><span>{money(tax)}</span></p><p className="total"><span>Total</span><span>{money(subtotal+tax)}</span></p></div>{error && <div className="form-error">{error}</div>}</>}</div>
    <footer><Button onClick={place} busy={busy} disabled={!items.length}>Place order <ArrowRight size={18}/></Button><small>You won’t be charged online for this demo.</small></footer>
  </aside></div>;
}

function OrdersView({ orders, loading, onUpdated, onToast }: { orders: Order[]; loading: boolean; onUpdated:()=>Promise<void>; onToast:(s:string)=>void }) {
  const [expanded, setExpanded] = useState<number | null>(orders[0]?.id || null);
  const [confirming,setConfirming]=useState<number|null>(null);
  const confirmPickup=async(id:number)=>{setConfirming(id);try{const result=await api<{receiptWarning?:string}>(`/api/orders/${id}/confirm-pickup`,{method:'POST'});onToast(result.receiptWarning||'Pickup confirmed. Your receipt is ready.');await onUpdated()}catch(error){onToast(error instanceof Error?error.message:'Could not confirm pickup.')}finally{setConfirming(null)}};
  if (loading) return <main className="orders-page"><div className="skeleton wide"/><div className="skeleton row"/><div className="skeleton row"/></main>;
  return <main className="orders-page"><div className="page-heading"><div><span className="eyebrow">Order history</span><h1>Your orders</h1><p>Everything you’ve ordered, all in one place.</p></div></div>
    {!orders.length ? <EmptyState icon={ReceiptText} title="No orders yet" copy="Your first order will appear here." /> : <div className="order-list">{orders.map(order => <article className={`order-card ${expanded === order.id ? 'open' : ''}`} key={order.id}>
      <button className="order-summary" onClick={()=>setExpanded(expanded===order.id?null:order.id)}><div className={`status-icon ${order.status.toLowerCase()}`}>{order.status === 'PICKED_UP' ? <Check/> : order.status === 'READY' ? <PackageCheck/> : <Clock3/>}</div><div><small>Order #{order.id} · {date(order.created_at)}</small><h3>{order.items.slice(0,2).map(i=>i.item_name).join(', ')}{order.items.length>2?` +${order.items.length-2}`:''}</h3></div><div className="summary-meta"><span className={`status ${order.status.toLowerCase()}`}>{statusLabel[order.status]}</span><strong>{money(order.total_cents)}</strong><ChevronDown size={18}/></div></button>
      {expanded === order.id && <div className="order-detail"><div className="progress">{(['PENDING','IN_PROGRESS','READY','PICKED_UP'] as Status[]).map((s,i)=>{const current=['PENDING','IN_PROGRESS','READY','PICKED_UP'].indexOf(order.status);return <div className={i<=current?'done':''} key={s}><i>{i<current?<Check size={12}/>:i+1}</i><span>{statusLabel[s]}</span></div>})}</div><div className="detail-grid"><div><h4>Items</h4>{order.items.map(item=><p key={item.id}><span>{item.quantity}× {item.item_name} <small>· {item.variant_label}</small></span><span>{money(item.quantity*item.price_at_order_cents)}</span></p>)}</div><div><h4>Pickup</h4><p><span>{order.pickup_assigned?`${date(order.pickup_time)} at ${time(order.pickup_time)}`:`${date(order.requested_date)} · Time awaiting kitchen`}</span></p>{order.notes&&<><h4>Notes</h4><p><span>{order.notes}</span></p></>}</div></div><div className="invoice-total"><span>Invoice total</span><strong>{money(order.total_cents)}</strong>{order.status==='READY'&&<Button busy={confirming===order.id} onClick={()=>confirmPickup(order.id)}><PackageCheck size={17}/> I’ve picked this up</Button>}{order.receipt_id && <a className="button secondary" href={`/api/receipts/${order.id}`} target="_blank" rel="noreferrer"><Download size={17}/> View receipt</a>}</div></div>}
    </article>)}</div>}
  </main>;
}

function ProfileView({user,onUserUpdated,onToast}:{user:User;onUserUpdated:(user:User)=>void;onToast:(s:string)=>void}){
  const [profile,setProfile]=useState<Profile|null>(null);const [busy,setBusy]=useState(false);
  useEffect(()=>{api<{profile:Profile}>('/api/profile').then(r=>setProfile(r.profile)).catch(e=>onToast(e instanceof Error?e.message:'Could not load profile.'))},[]);
  if(!profile)return <main className="orders-page"><div className="skeleton wide"/></main>;
  const save=async(e:FormEvent)=>{e.preventDefault();setBusy(true);try{const result=await api<{profile:Profile}>('/api/profile',{method:'PUT',body:JSON.stringify({name:profile.name,phone:profile.phone,foodPreference:profile.food_preference,allergies:profile.allergies,spiceLevel:profile.spice_level})});setProfile(result.profile);onUserUpdated({...user,name:result.profile.name});onToast('Profile and food preferences saved.')}catch(error){onToast(error instanceof Error?error.message:'Could not save profile.')}finally{setBusy(false)}};
  return <main className="profile-page"><div className="page-heading"><span className="eyebrow">Your account</span><h1>Profile & settings</h1><p>Help the kitchen prepare every order with care.</p></div><form onSubmit={save} className="profile-layout"><section className="profile-card"><header><div className="profile-avatar">{profile.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div><div><h2>My profile</h2><p>Contact details for pickup updates.</p></div></header><div className="profile-fields"><label>Full name<input value={profile.name} minLength={2} required onChange={e=>setProfile({...profile,name:e.target.value})}/></label><label>Email address<input value={profile.email} disabled/></label><label>Phone number<input value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})} placeholder="(555) 123-4567"/></label></div></section><section className="profile-card preferences"><header><div className="preference-icon"><SlidersHorizontal/></div><div><h2>Food preferences</h2><p>These details are shared with the kitchen.</p></div></header><div className="preference-group"><label>Dietary preference</label><div className="choice-grid">{([['NONE','No preference'],['VEGETARIAN','Vegetarian'],['VEGAN','Vegan'],['JAIN','Jain']] as const).map(([value,label])=><button type="button" onClick={()=>setProfile({...profile,food_preference:value})} className={profile.food_preference===value?'active':''} key={value}><Leaf/>{label}</button>)}</div></div><div className="preference-group"><label>Spice level</label><div className="choice-grid spice">{([['MILD','Mild'],['MEDIUM','Medium'],['HOT','Hot'],['EXTRA_HOT','Extra hot']] as const).map(([value,label],index)=><button type="button" onClick={()=>setProfile({...profile,spice_level:value})} className={profile.spice_level===value?'active':''} key={value}>{Array.from({length:index+1},(_,i)=><Flame key={i}/>)}<span>{label}</span></button>)}</div></div><label className="allergy-field"><ShieldCheck/> Allergies or preparation notes<textarea value={profile.allergies} onChange={e=>setProfile({...profile,allergies:e.target.value})} placeholder="List any food allergies or cross-contact concerns…" maxLength={500}/></label></section><footer><Button type="submit" busy={busy}>Save changes</Button></footer></form></main>
}

function AdminPortal({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<'overview'|'orders'|'menu'>('overview'); const [orders,setOrders]=useState<Order[]>([]); const [menu,setMenu]=useState<MenuItem[]>([]); const [loading,setLoading]=useState(true); const [toast,setToast]=useState(''); const [mobileOpen,setMobileOpen]=useState(false);
  const load=useCallback(async()=>{setLoading(true);try{const [o,m]=await Promise.all([api<{orders:Order[]}>('/api/orders'),api<{menu:MenuItem[]}>('/api/menu')]);setOrders(o.orders);setMenu(m.menu)}finally{setLoading(false)}},[]); useEffect(()=>{load()},[load]);
  const navigate=(next:typeof view)=>{setView(next);setMobileOpen(false)};
  return <div className="admin-shell"><aside className={`admin-sidebar ${mobileOpen?'mobile-open':''}`}><div className="admin-brand"><Brand onClick={()=>navigate('overview')}/><button onClick={()=>setMobileOpen(false)}><X/></button></div><div className="workspace-label">Workspace</div><nav><button className={view==='overview'?'active':''} onClick={()=>navigate('overview')}><LayoutDashboard/> Overview</button><button className={view==='orders'?'active':''} onClick={()=>navigate('orders')}><ShoppingBag/> Orders <span>{orders.filter(o=>o.status!=='PICKED_UP').length}</span></button><button className={view==='menu'?'active':''} onClick={()=>navigate('menu')}><UtensilsCrossed/> Menu</button></nav><div className="sidebar-bottom"><div className="user-chip"><span>{user.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</span><div><strong>{user.name}</strong><small>Administrator</small></div></div><button className="icon-button" onClick={onLogout}><LogOut size={18}/></button></div></aside>
    <div className="admin-content"><header className="admin-top"><button className="mobile-menu" aria-label="Open navigation" onClick={()=>setMobileOpen(true)}><MenuIcon/></button><div><span>{new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})}</span></div><div><button className="icon-button" aria-label="Notifications"><Bell size={19}/><i/></button></div></header>
      {view==='overview'&&<AdminOverview orders={orders} loading={loading} onViewOrders={()=>setView('orders')} onToast={setToast}/>} {view==='orders'&&<AdminOrders orders={orders} loading={loading} onUpdated={load} onToast={setToast}/>} {view==='menu'&&<AdminMenu menu={menu} loading={loading} onUpdated={load} onToast={setToast}/>} </div>
    {mobileOpen&&<div className="sidebar-scrim" onClick={()=>setMobileOpen(false)}/>} {toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</div>;
}

function AdminOverview({orders,loading,onViewOrders,onToast}:{orders:Order[];loading:boolean;onViewOrders:()=>void;onToast:(s:string)=>void}) {
  const today=orders.filter(o=>new Date(o.created_at.includes('T')?o.created_at:`${o.created_at.replace(' ','T')}Z`).toDateString()===new Date().toDateString()); const revenue=today.reduce((s,o)=>s+o.total_cents,0); const active=today.filter(o=>o.status!=='PICKED_UP');
  const sendDigest=async()=>{try{await api('/api/admin/digest',{method:'POST'});onToast('Daily digest sent.')}catch(e){onToast(e instanceof Error?e.message:'Could not send digest.')}};
  return <main className="admin-page"><div className="page-heading admin"><div><span className="eyebrow">Kitchen pulse</span><h1>Good {new Date().getHours()<12?'morning':'afternoon'}, {`team`}.</h1><p>Here’s what’s happening at Rasoi today.</p></div><Button variant="secondary" onClick={sendDigest}><Mail size={17}/> Send digest</Button></div>
    <section className="stats-grid"><div><span className="stat-icon orange"><ShoppingBag/></span><p>Today’s orders</p><strong>{loading?'—':today.length}</strong><small>{active.length} still active</small></div><div><span className="stat-icon green"><CircleDollarSign/></span><p>Today’s revenue</p><strong>{loading?'—':money(revenue)}</strong><small>Before processing fees</small></div><div><span className="stat-icon blue"><Clock3/></span><p>Times to assign</p><strong>{active.filter(o=>!o.pickup_assigned).length}</strong><small>For next-day pickup</small></div><div><span className="stat-icon purple"><PackageCheck/></span><p>Ready now</p><strong>{today.filter(o=>o.status==='READY').length}</strong><small>Awaiting client confirmation</small></div></section>
    <section className="dashboard-grid"><div className="panel"><header><div><h2>Active orders</h2><p>Live kitchen queue</p></div><button onClick={onViewOrders}>View all <ArrowRight size={15}/></button></header>{active.length?<div className="compact-orders">{active.slice(0,5).map(o=><div key={o.id}><span className={`status-dot ${o.status.toLowerCase()}`}/><div><strong>#{o.id} · {o.client_name}</strong><small>{o.items.map(i=>`${i.quantity}× ${i.item_name}`).join(', ')}</small></div><time>{o.pickup_assigned?time(o.pickup_time):'Assign time'}</time><span className={`status ${o.status.toLowerCase()}`}>{statusLabel[o.status]}</span></div>)}</div>:<EmptyState icon={ChefHat} title="Kitchen is clear" copy="New orders will show up here."/>}</div>
      <div className="panel prep-panel"><header><div><h2>Pickup rhythm</h2><p>Orders by time</p></div></header><div className="rhythm">{['12 PM','2 PM','4 PM','6 PM'].map((label,i)=><div key={label}><span>{label}</span><i style={{height:`${Math.max(12, today.filter(o=>new Date(o.pickup_time).getHours()<=12+i*2).length*18)}px`}}/></div>)}</div><div className="digest-note"><Mail size={20}/><div><strong>Daily digest</strong><small>Scheduled for 6:00 PM</small></div><Check size={17}/></div></div></section>
  </main>;
}

function AdminOrders({orders,loading,onUpdated,onToast}:{orders:Order[];loading:boolean;onUpdated:()=>Promise<void>;onToast:(s:string)=>void}) {
  const [filter,setFilter]=useState<'ALL'|Status>('ALL'); const [query,setQuery]=useState(''); const [updating,setUpdating]=useState<number|null>(null);
  const filtered=orders.filter(o=>(filter==='ALL'||o.status===filter)&&(`${o.id} ${o.client_name} ${o.client_email}`.toLowerCase().includes(query.toLowerCase())));
  const update=async(id:number,status:Status)=>{setUpdating(id);try{const r=await api<{receiptWarning?:string}>(`/api/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});onToast(r.receiptWarning||`Order #${id} updated to ${statusLabel[status]}.`);await onUpdated()}catch(e){onToast(e instanceof Error?e.message:'Update failed.')}finally{setUpdating(null)}};
  return <main className="admin-page"><div className="page-heading admin"><div><span className="eyebrow">Order operations</span><h1>Orders</h1><p>Keep every pickup moving smoothly.</p></div></div><div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search orders or clients…"/></div><div className="filter-tabs">{(['ALL','PENDING','IN_PROGRESS','READY','PICKED_UP'] as const).map(s=><button className={filter===s?'active':''} onClick={()=>setFilter(s)} key={s}>{s==='ALL'?'All':statusLabel[s]}</button>)}</div></div>
    <section className="orders-table panel">{loading?<div className="skeleton row"/>:!filtered.length?<EmptyState icon={Search} title="No matching orders" copy="Try another status or search term."/>:<>{filtered.map(o=><article key={o.id}><div className="order-id"><strong>#{o.id}</strong><small>{date(o.created_at)}</small></div><div className="customer"><span>{o.client_name.split(' ').map(n=>n[0]).join('').slice(0,2)}</span><div><strong>{o.client_name}</strong><small>{o.client_email}</small></div></div><div className="ordered-items"><strong>{o.items.map(i=>`${i.quantity}× ${i.item_name} (${i.variant_label})`).join(', ')}</strong>{o.notes&&<small><NotebookText size={13}/>{o.notes}</small>}</div><SchedulePickup order={o} onUpdated={onUpdated} onToast={onToast}/><strong className="price">{money(o.total_cents)}</strong><div className="status-select"><select value={o.status} disabled={updating===o.id} onChange={e=>update(o.id,e.target.value as Status)}>{(['PENDING','IN_PROGRESS','READY','PICKED_UP'] as Status[]).map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select><ChevronDown size={14}/>{updating===o.id&&<LoaderCircle className="spin"/>}</div></article>)}</>}</section>
  </main>;
}

function SchedulePickup({order,onUpdated,onToast}:{order:Order;onUpdated:()=>Promise<void>;onToast:(s:string)=>void}){
  const initial=order.pickup_assigned?new Date(new Date(order.pickup_time).getTime()-new Date(order.pickup_time).getTimezoneOffset()*60000).toISOString().slice(0,16):`${order.requested_date}T12:00`;
  const [value,setValue]=useState(initial);const [busy,setBusy]=useState(false);
  const save=async()=>{setBusy(true);try{await api(`/api/admin/orders/${order.id}/pickup`,{method:'PATCH',body:JSON.stringify({pickupTime:new Date(value).toISOString()})});onToast(`Pickup time assigned for order #${order.id}.`);await onUpdated()}catch(error){onToast(error instanceof Error?error.message:'Could not assign time.')}finally{setBusy(false)}};
  return <div className={`pickup-scheduler ${order.pickup_assigned?'assigned':''}`}><input aria-label={`Pickup time for order ${order.id}`} type="datetime-local" value={value} min={`${order.requested_date}T00:00`} max={`${order.requested_date}T23:59`} onChange={e=>setValue(e.target.value)}/><button aria-label={`Save pickup time for order ${order.id}`} onClick={save} disabled={busy}>{busy?<LoaderCircle className="spin"/>:<Check/>}</button><small>{order.pickup_assigned?'Assigned':'Assign time'}</small></div>
}

type ItemDraft={name:string;description:string;price:string;category:string;isAvailable:boolean;quantityMode:'COUNT'|'PORTION';portionPrices:{label:string;price:string}[]};
const blankDraft:ItemDraft={name:'',description:'',price:'',category:'Bowls',isAvailable:true,quantityMode:'COUNT',portionPrices:[{label:'8 oz',price:''},{label:'16 oz',price:''},{label:'32 oz',price:''}]};
function AdminMenu({menu,loading,onUpdated,onToast}:{menu:MenuItem[];loading:boolean;onUpdated:()=>Promise<void>;onToast:(s:string)=>void}) {
  const [editing,setEditing]=useState<MenuItem|null|false>(false); const [draft,setDraft]=useState<ItemDraft>(blankDraft); const [busy,setBusy]=useState(false); const categories=useMemo(()=>[...new Set(menu.map(i=>i.category))],[menu]);
  const open=(item?:MenuItem)=>{setEditing(item||null);setDraft(item?{name:item.name,description:item.description,price:(item.price_cents/100).toFixed(2),category:item.category,isAvailable:!!item.is_available,quantityMode:item.quantity_mode,portionPrices:['8 oz','16 oz','32 oz'].map(label=>{const option=item.options.find(o=>o.label===label);return{label,price:option?(option.price_cents/100).toFixed(2):''}})}:{...blankDraft,portionPrices:blankDraft.portionPrices.map(p=>({...p}))})};
  const payload=(source:ItemDraft)=>({name:source.name,description:source.description,price:Number(source.quantityMode==='PORTION'?source.portionPrices[0].price:source.price),category:source.category,isAvailable:source.isAvailable,quantityMode:source.quantityMode,options:source.quantityMode==='PORTION'?source.portionPrices.map(p=>({label:p.label,price:Number(p.price)})):[]});
  const save=async(e:FormEvent)=>{e.preventDefault();setBusy(true);try{await api(editing?`/api/admin/menu/${editing.id}`:'/api/admin/menu',{method:editing?'PUT':'POST',body:JSON.stringify(payload(draft))});onToast(editing?'Menu item updated.':'Menu item added.');setEditing(false);await onUpdated()}catch(err){onToast(err instanceof Error?err.message:'Could not save item.')}finally{setBusy(false)}};
  const toggle=async(item:MenuItem)=>{const source:ItemDraft={name:item.name,description:item.description,price:(item.price_cents/100).toFixed(2),category:item.category,isAvailable:!item.is_available,quantityMode:item.quantity_mode,portionPrices:item.options.map(o=>({label:o.label,price:(o.price_cents/100).toFixed(2)}))};await api(`/api/admin/menu/${item.id}`,{method:'PUT',body:JSON.stringify(payload(source))});onToast(`${item.name} is now ${item.is_available?'unavailable':'available'}.`);await onUpdated()};
  return <main className="admin-page"><div className="page-heading admin"><div><span className="eyebrow">Kitchen catalog</span><h1>Menu</h1><p>{menu.filter(i=>i.is_available).length} items available across {categories.length} categories.</p></div><Button onClick={()=>open()}><Plus size={18}/> Add item</Button></div>
    {loading?<div className="loading-grid"><div className="skeleton"/><div className="skeleton"/></div>:<div className="admin-menu-grid">{menu.map((item,index)=><article className={!item.is_available?'unavailable':''} key={item.id}><div className={`mini-dish tone-${index%5}`}><div className="dish"><i/><i/><i/></div><span>{item.category}</span></div><div className="admin-item-body"><header><div><h3>{item.name}</h3><span className={item.is_available?'available':'sold'}>{item.is_available?'Available':'Unavailable'}</span></div><div><button onClick={()=>open(item)}><Edit3 size={17}/></button></div></header><p>{item.description}</p><footer><strong>{money(item.price_cents)}</strong><label className="toggle"><input type="checkbox" checked={!!item.is_available} onChange={()=>toggle(item)}/><i/></label></footer></div></article>)}</div>}
    {editing!==false&&<div className="modal-layer"><div className="modal-backdrop" onClick={()=>setEditing(false)}/><form className="modal" onSubmit={save}><header><div><span className="eyebrow">{editing?'Edit dish':'New dish'}</span><h2>{editing?'Update menu item':'Add to the menu'}</h2></div><button type="button" className="icon-button" onClick={()=>setEditing(false)}><X/></button></header><div className="form-grid"><label className="full">Name<input required minLength={2} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="e.g. Saffron Paneer Bowl"/></label><label className="full">Description<textarea required value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Ingredients and preparation…"/></label><label>Quantity type<select value={draft.quantityMode} onChange={e=>setDraft({...draft,quantityMode:e.target.value as 'COUNT'|'PORTION'})}><option value="COUNT">Number of items</option><option value="PORTION">Portion size</option></select></label><label>Category<input required list="categories" value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}/><datalist id="categories">{categories.map(c=><option key={c} value={c}/>)}</datalist></label>{draft.quantityMode==='COUNT'?<label className="full">Price per item<input required type="number" min="0" step="0.01" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})} placeholder="0.00"/></label>:<div className="portion-price-fields full">{draft.portionPrices.map((option,index)=><label key={option.label}>{option.label}<input required type="number" min="0" step="0.01" value={option.price} onChange={e=>setDraft({...draft,portionPrices:draft.portionPrices.map((p,i)=>i===index?{...p,price:e.target.value}:p)})} placeholder="0.00"/></label>)}</div>}<label className="availability full"><span><strong>Available to order</strong><small>Clients can add this item to their bag.</small></span><span className="toggle"><input type="checkbox" checked={draft.isAvailable} onChange={e=>setDraft({...draft,isAvailable:e.target.checked})}/><i/></span></label></div><footer><Button type="button" variant="secondary" onClick={()=>setEditing(false)}>Cancel</Button><Button type="submit" busy={busy}>{editing?'Save changes':'Add item'}</Button></footer></form></div>}
  </main>;
}

export default function App() {
  const [user,setUser]=useState<User|null>(null); const [checking,setChecking]=useState(true);
  useEffect(()=>{api<{user:User}>('/api/auth/me').then(r=>setUser(r.user)).catch(()=>{}).finally(()=>setChecking(false))},[]);
  const logout=async()=>{await api('/api/auth/logout',{method:'POST'}).catch(()=>{});setUser(null)};
  if(checking)return <div className="app-loading"><Brand/><LoaderCircle className="spin"/></div>;
  if(!user)return <Login onLogin={setUser}/>;
  return user.role==='ADMIN'?<AdminPortal user={user} onLogout={logout}/>:<ClientPortal user={user} onLogout={logout} onUserUpdated={setUser}/>;
}
