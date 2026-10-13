import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { areas } from './data';
import { dateISO, stayLabels, type Property, type Stay } from './domain';
import { propertyAmenities, propertyFromForm, roomTypes } from './property-form';

const stayTypes: Stay[] = ['monthly', 'short', 'day'];
function RoomFields({ roomKey, index, removable, onRemove }: {roomKey: string; index: number; removable: boolean; onRemove: () => void}) {
  const [offered, setOffered] = useState<Stay[]>(['monthly', 'short', 'day']);
  return <fieldset className="property-room-fields">
    <legend>Room option {index + 1}</legend>
    <div className="section-top"><p>Prices and bed counts apply to this option only.</p>{removable && <button type="button" className="btn small" onClick={onRemove} aria-label={`Remove room option ${index + 1}`}><X size={15}/> Remove</button>}</div>
    <div className="form-grid">
      <label>Room sharing<select name={`${roomKey}-sharing`} defaultValue="2">{roomTypes.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>
      <label className="check-label"><input type="checkbox" name={`${roomKey}-ac`}/>Air conditioning (AC)</label>
      <label>Total beds<input type="number" name={`${roomKey}-capacity`} min="1" max="500" defaultValue="6" required/><small>Number of beds, not number of rooms.</small></label>
      <label>Already occupied offline<input type="number" name={`${roomKey}-offline`} min="0" max="500" defaultValue="0" required/></label>
    </div>
    <label>Offline beds free from (optional)<input type="date" name={`${roomKey}-availableFrom`} min={dateISO()}/></label>
    <fieldset className="property-stays"><legend>Offered stays</legend><div className="property-options">{stayTypes.map(s => <label key={s} className="check-label"><input type="checkbox" name={`${roomKey}-stay-${s}`} checked={offered.includes(s)} onChange={e => setOffered(current => e.target.checked ? [...current, s] : current.filter(x => x !== s))}/>{stayLabels[s]}</label>)}</div></fieldset>
    <div className="form-grid">{stayTypes.map(s => <label key={s}>{s === 'monthly' ? 'Monthly rent' : s === 'short' ? 'Per night' : 'Day stay'} per bed (₹)<input name={`${roomKey}-${s}`} type="number" min={s === 'monthly' ? 500 : 1} max={s === 'monthly' ? 200000 : 50000} required={offered.includes(s)} disabled={!offered.includes(s)} placeholder={offered.includes(s) ? 'Enter price' : 'Not offered'}/></label>)}</div>
  </fieldset>;
}

export default function AddPropertyForm({onSubmit}: {onSubmit: (property: Property) => Promise<void>}) {
  const [roomKeys, setRoomKeys] = useState(() => [crypto.randomUUID()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <form className="dialog-form property-onboarding" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    setError('');
    try {const property = propertyFromForm(new FormData(e.currentTarget), roomKeys, `p-${crypto.randomUUID().slice(0, 8)}`); setBusy(true); await onSubmit(property);}
    catch (err) {setError(err instanceof Error ? err.message : 'Could not submit the property.');}
    finally {setBusy(false);}
  }}>
    <p>Use sample information for this demo. Enter the details customers should see; your listing appears in search after admin approval.</p>
    <fieldset disabled={busy} className="property-form-content">
      <section className="property-form-section" aria-label="Property details"><h3>1. Property details</h3>
        <label>Property name<input name="name" required maxLength={80}/></label>
        <div className="form-grid"><label>Locality<select name="area">{Object.keys(areas).filter(a => a !== 'All Hyderabad').map(a => <option key={a}>{a}</option>)}</select></label><label>Category<select name="category"><option>Men</option><option>Women</option><option>Co-living</option></select></label></div>
        <label>Address<input name="address" required maxLength={500}/></label>
        <label>About the property<textarea name="description" required rows={3} maxLength={2000} placeholder="Describe the rooms, neighbourhood and what makes your property special."/></label>
        <div className="form-grid"><label>Nearby college / landmark<input name="landmark" maxLength={150}/></label><label>Provider phone (optional)<input name="phone" type="tel" maxLength={20}/></label></div>
        <details><summary>Exact map location (optional)</summary><p>Without coordinates, the map uses the locality centre. Nearby distances will be approximate.</p><div className="form-grid"><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90"/></label><label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180"/></label></div></details>
      </section>
      <section className="property-form-section" aria-label="Room options"><h3>2. Rooms, beds & prices</h3><p>Add separate options for different sharing types or AC and non-AC prices. All prices are per person.</p>
        {roomKeys.map((key, index) => <RoomFields key={key} roomKey={key} index={index} removable={roomKeys.length > 1} onRemove={() => setRoomKeys(current => current.filter(k => k !== key))}/>)}
        <button type="button" className="btn" disabled={roomKeys.length >= 20} onClick={() => setRoomKeys(current => [...current, crypto.randomUUID()])}><Plus size={17}/>Add another room option</button>
      </section>
      <section className="property-form-section" aria-label="Amenities and photos"><h3>3. Amenities & photos</h3><p>Select only the amenities you provide.</p><div className="property-options">{propertyAmenities.map(a => <label className="check-label" key={a}><input type="checkbox" name="amenities" value={a}/>{a}</label>)}</div>
        <label>Photo links (optional)<textarea name="photos" rows={3} placeholder="https://…"/><small>Up to 8 HTTPS image links, one per line. First image is the cover. Leave blank to use an illustrative demo photo.</small></label>
      </section>
      <section className="property-form-section" aria-label="Rules and policies"><h3>4. Rules & policies</h3>
        <label>House rules (one per line)<textarea name="rules" rows={4} required maxLength={2000} placeholder={'Example: Quiet hours after 10 pm\nVisitors allowed in common areas only'}/><small>Your rules appear on the property page and in the admin review.</small></label>
        <div className="form-grid"><label>Cancellation policy<select name="policy" defaultValue="24"><option value="24">Flexible — 24 hours before check-in</option><option value="72">Moderate — 72 hours before check-in</option><option value="168">Strict — 7 days before check-in</option><option value="-1">Non-refundable</option></select></label><label>Move-out notice (days)<input name="notice" type="number" min="0" max="365" defaultValue="30" required/></label>
        <label>Security deposit (₹)<input name="deposit" type="number" min="0" max="1000000" defaultValue="0" required/></label><label>Monthly meal add-on (₹)<input name="mealPrice" type="number" min="0" max="50000" defaultValue="0" required/></label></div>
        <p>The deposit is collected at the property. Enter 0 for no deposit, no meals, or meals included in rent.</p>
        <div className="form-grid"><label>Check-in / day slot starts<input type="time" name="dayStart" defaultValue="09:00" required/></label><label>Check-out / day slot ends<input type="time" name="dayEnd" defaultValue="20:00" required/></label></div>
        <label className="check-label"><input type="checkbox" name="overnight"/>Day stay may include overnight use</label>
      </section>
      <section className="property-form-section" aria-label="Reservation advances"><h3>5. Reservation advances</h3><p>Set the advance deducted from rent. The platform adds its booking charge to the amount paid online.</p>
        {stayTypes.map(s => <div className="form-grid" key={s}><label>{stayLabels[s]} advance<select name={`${s}-kind`} defaultValue="fixed"><option value="fixed">Fixed rupees</option><option value="percent">Percentage of rent</option></select></label><label>{stayLabels[s]} amount / percent<input name={`${s}-value`} type="number" min="0" max="200000" defaultValue="0" required/></label></div>)}
      </section>
      {error && <p className="property-form-error" role="alert">{error}</p>}
      <button className="btn primary" type="submit">{busy ? 'Submitting…' : 'Submit for demo verification'}</button>
    </fieldset>
  </form>;
}
