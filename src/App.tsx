import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Heart,
  Home,
  LayoutDashboard,
  List,
  LogOut,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  Phone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  Wallet,
  Wifi,
  Wind,
  X,
  Utensils,
  Bell,
  FileCheck2,
  AlertCircle,
  Copy,
  Send,
  CheckCircle2,
  Clock3,
  Pause,
  Play,
  Download,
  Pencil,
  Eye,
} from "lucide-react";
import { areas } from "./data";
import { useDemo, demoEmail } from "./backend/demo";
import DemoAccount from "./DemoAccount";
import CustomerProfileForm from "./CustomerProfileForm";
import {
  addDays,
  addMonth,
  available,
  dateISO,
  distanceKm,
  formatDate,
  money,
  nights,
  quote,
  refundFor,
  stayLabels,
  type Booking,
  type Category,
  type Property,
  type Stay,
} from "./domain";
const MapView = lazy(() => import("./MapView"));
const AddPropertyForm = lazy(() => import("./AddPropertyForm"));
import { portalPath, portalRole } from "./portal";
import { thumbnail } from "./images";

const formatBookingTime = (value: string) => Number.isFinite(Date.parse(value))
  ? `${new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(value))} IST`
  : "Not recorded";
const policyName = (n: number) =>
  n < 0
    ? "Non-refundable"
    : `${n === 168 ? "7 days" : `${n} hours`} before check-in`;
const iconFor = (s: string) =>
  s === "Wi-Fi" ? (
    <Wifi size={16} />
  ) : s === "Meals" ? (
    <Utensils size={16} />
  ) : (
    <Check size={16} />
  );
type Modal =
  | { type: "login" }
  | { type: "customer-profile"; p?: Property }
  | { type: "detail"; p: Property }
  | { type: "checkout"; p: Property; requestId: string }
  | { type: "booking-unavailable" }
  | { type: "account-required"; reason: "setup" | "wrong-role" }
  | { type: "verification-review"; p: Property }
  | { type: "filters" }
  | { type: "chat"; p: Property }
  | { type: "complaint"; bookingId?: string }
  | { type: "cancel"; b: Booking }
  | { type: "moveout"; b: Booking }
  | { type: "change"; b: Booking }
  | { type: "review"; b: Booking }
  | { type: "edit"; p: Property }
  | { type: "add" }
  | { type: "support" }
  | { type: "reset" }
  | { type: "navigation" }
  | null;
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>(
      "input,button,select,textarea",
    );
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const all = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href]",
          ),
        ).filter((x) => !x.hasAttribute("disabled"));
        if (e.shiftKey && document.activeElement === all[0]) {
          e.preventDefault();
          all.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === all.at(-1)) {
          e.preventDefault();
          all[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      prior?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className={`dialog ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <Building2 size={23} />
      </span>
      loco<span>rent</span>
      <i />
    </span>
  );
}
function App() {
  const role = portalRole(window.location.pathname);
  const demo = useDemo(role);
  const {state} = demo;
  const demoSession = state.session?.role === role ? state.session : null;
  const accountUrl = `${portalPath(role)}?account=1`;
  const [page, setPage] = useState(role === "customer" ? "discover" : "overview");
  const [modal, setModal] = useState<Modal>(null);
  const close = useCallback(() => setModal(null), []);
  const [toast, setToast] = useState("");
  const [stay, setStay] = useState<Stay>("monthly");
  const [start, setStart] = useState(dateISO());
  const [end, setEnd] = useState(addDays(dateISO(), 2));
  const [area, setArea] = useState("Gachibowli");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [mapMode, setMapMode] = useState(false);
  const [sort, setSort] = useState("nearby");
  const [filters, setFilters] = useState({
    max: 20000,
    sharing: "all",
    ac: false,
    wifi: false,
    meals: false,
    radius: 20,
  });
  const [geo, setGeo] = useState<[number, number] | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [withMeals, setWithMeals] = useState(false);
  const [bookingAccessBusy, setBookingAccessBusy] = useState(false);
  const [bookingTab, setBookingTab] = useState("all");
  const [ownerProperty, setOwnerProperty] = useState("all");
  const newestBookings = [...state.bookings].sort(
    (a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0),
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (s: string) => setToast(demo.saving() ? "Saving your demo change…" : s);
  const update = (fn: (s: typeof state) => typeof state) => {
    void demo.update(fn).then(() => notify("Demo change saved across portals.")).catch(error => notify(error instanceof Error ? error.message : "The demo change could not be saved."));
  };
  const patchBooking = (id: string, patch: Partial<Booking>) =>
    update((s) => ({
      ...s,
      bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  const patchProperty = (id: string, patch: Partial<Property>) =>
    update((s) => ({
      ...s,
      properties: s.properties.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    }));
  const effectiveEnd =
    stay === "monthly"
      ? addMonth(start)
      : stay === "day"
        ? addDays(start, 1)
        : end;
  const centre = geo || areas[area] || areas.Gachibowli;
  const list = state.properties
    .filter(
      (p) =>
        p.verified &&
        !p.paused &&
        (category === "All" || p.category === category) &&
        `${p.name} ${p.area} ${p.landmark} ${p.amenities.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!filters.wifi || p.amenities.includes("Wi-Fi")) &&
        (!filters.meals || p.amenities.includes("Meals")) &&
        ((area === "All Hyderabad" && !geo) ||
          distanceKm(...centre, p.lat, p.lng) <= filters.radius) &&
        p.rooms.some(
          (r) =>
            r.stays.includes(stay) &&
            (!filters.ac || r.ac) &&
            (filters.sharing === "all" ||
              r.sharing === Number(filters.sharing)) &&
            available(r, state.bookings, start, effectiveEnd, stay) > 0 &&
            quote(
              p,
              r,
              stay,
              start,
              effectiveEnd,
              filters.meals,
              state.feePercent,
              state.feeCap,
            ).total <= filters.max,
        ),
    )
    .sort((a, b) =>
      sort === "rating"
        ? b.rating - a.rating
        : sort === "price"
          ? fromPrice(a) - fromPrice(b)
          : distanceKm(...centre, a.lat, a.lng) -
            distanceKm(...centre, b.lat, b.lng),
    );
  function fromPrice(p: Property) {
    return Math.min(
      ...p.rooms
        .filter(
          (r) =>
            r.stays.includes(stay) &&
            (!filters.ac || r.ac) &&
            (filters.sharing === "all" ||
              r.sharing === Number(filters.sharing)) &&
            available(r, state.bookings, start, effectiveEnd, stay) > 0,
        )
        .map(
          (r) =>
            quote(
              p,
              r,
              stay,
              start,
              effectiveEnd,
              filters.meals,
              state.feePercent,
              state.feeCap,
            ).total,
        ),
    );
  }
  const openProperty = useCallback(
    (p: Property) => {
      const r = p.rooms.find(
        (r) =>
          r.stays.includes(stay) &&
          available(r, state.bookings, start, effectiveEnd, stay) > 0,
      );
      setRoomId(r?.id || p.rooms[0].id);
      setWithMeals(filters.meals);
      setModal({ type: "detail", p });
    },
    [stay, start, effectiveEnd, state.bookings, filters.meals],
  );
  function locate() {
    if (!navigator.geolocation) {
      notify("Location is unavailable. Please choose an area.");
      return;
    }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo([pos.coords.latitude, pos.coords.longitude]);
        setLocationBusy(false);
        notify(
          "Showing stays near your location. Choose an area if you are outside Hyderabad.",
        );
      },
      () => {
        setLocationBusy(false);
        notify(
          "Location permission was not granted. You can choose an area instead.",
        );
      },
      { timeout: 10000 },
    );
  }
  const fav = (id: string) => {
    if (!demoSession) { setModal({ type: "login" }); return; }
    update((s) => ({
      ...s,
      favourites: s.favourites.includes(id)
        ? s.favourites.filter((x) => x !== id)
        : [...s.favourites, id],
    }));
  };
  function navigate(p: string) {
    if (role === "customer" && p !== "discover" && !demoSession) {
      setModal({ type: "login" });
      return;
    }
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const nav =
    role === "customer"
      ? [
          { id: "discover", label: "Discover", icon: Home },
          { id: "favourites", label: "Saved stays", icon: Heart },
          { id: "bookings", label: "My bookings", icon: CalendarDays },
          { id: "messages", label: "Messages", icon: MessageCircle },
          { id: "profile", label: "My account", icon: Users },
        ]
      : role === "owner"
        ? [
            { id: "overview", label: "Overview", icon: LayoutDashboard },
            { id: "properties", label: "My properties", icon: Building2 },
            { id: "inventory", label: "Availability", icon: BedDouble },
            { id: "bookings", label: "Bookings", icon: CalendarDays },
            { id: "messages", label: "Messages", icon: MessageCircle },
            { id: "payouts", label: "Payouts", icon: Wallet },
          ]
        : [
            { id: "overview", label: "Overview", icon: LayoutDashboard },
            { id: "verification", label: "Verification", icon: FileCheck2 },
            { id: "bookings", label: "All bookings", icon: CalendarDays },
            { id: "complaints", label: "Complaints", icon: MessageCircle },
            { id: "payouts", label: "Payouts", icon: Wallet },
            { id: "reports", label: "Reports", icon: ClipboardList },
            { id: "settings", label: "Fee settings", icon: Settings2 },
          ];
  const title = nav.find((n) => n.id === page)?.label || "LocoRent";
  const propertyFor = (b: Booking) =>
    state.properties.find((p) => p.id === b.propertyId)!;
  const ownerProps = state.properties.filter(
    (p) => ownerProperty === "all" || p.id === ownerProperty,
  );

  function card(p: Property) {
    const count = p.rooms
      .filter((r) => r.stays.includes(stay))
      .reduce(
        (n, r) => n + available(r, state.bookings, start, effectiveEnd, stay),
        0,
      );
    return (
      <article key={p.id} className="property-card">
        <div className="property-photo">
          <button
            className="photo-link"
            onClick={() => openProperty(p)}
            aria-label={`View ${p.name}`}
          >
            <img
              src={thumbnail(p.image)}
              alt={`Illustrative interior for ${p.name}`}
              loading="lazy"
              decoding="async"
            />
          </button>
          <span className="verified">
            <ShieldCheck size={13} /> Verified stay
          </span>
          <button
            className={`save-btn ${(!!demoSession && state.favourites.includes(p.id)) ? "saved" : ""}`}
            onClick={() => fav(p.id)}
            aria-label={`${(!!demoSession && state.favourites.includes(p.id)) ? "Unsave" : "Save"} ${p.name}`}
          >
            <Heart
              size={19}
              fill={(!!demoSession && state.favourites.includes(p.id)) ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="property-info">
          <div className="card-meta">
            <span>{p.category}</span>
            <span className="rating">
              <Star size={13} fill="currentColor" />
              {p.rating}
              <small>({p.reviews})</small>
            </span>
          </div>
          <button className="card-title" onClick={() => openProperty(p)}>
            {p.name}
            <ArrowRight size={17} />
          </button>
          <p className="property-location">
            <MapPin size={14} />
            {p.area}, Hyderabad{" "}
            <span>· {distanceKm(...centre, p.lat, p.lng).toFixed(1)} km</span>
          </p>
          <div className="amenities-inline">
            <span>
              <Wifi size={14} /> Wi-Fi
            </span>
            {p.rooms.some((r) => r.ac) && (
              <span>
                <Wind size={14} /> AC options
              </span>
            )}
            <span>
              <Utensils size={14} /> Meals
            </span>
          </div>
          <div className="card-bottom">
            <div>
              <small className="from-label">FROM</small>
              <strong>{money(fromPrice(p))}</strong>
              <span>
                {" "}
                /{" "}
                {stay === "monthly"
                  ? "first month"
                  : stay === "day"
                    ? "day"
                    : "stay"}
              </span>
              <small>
                Inclusive price ·{" "}
                {stay === "short"
                  ? `${nights(start, effectiveEnd)} nights`
                  : "per person"}
              </small>
            </div>
            <span className="available-dot">{count} beds available</span>
          </div>
        </div>
      </article>
    );
  }
  function pageHead(sub: string, action?: ReactNode) {
    return (
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {role === "owner"
              ? "YOUR HOSTING SPACE"
              : role === "admin"
                ? "PLATFORM OPERATIONS"
                : "YOUR LOCORENT SPACE"}
          </span>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        {action}
      </div>
    );
  }
  function empty(title: string, description: string, action?: ReactNode) {
    return (
      <div className="empty">
        <BedDouble size={37} />
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    );
  }
  function stats() {
    const active = state.bookings.filter(
      (b) => b.status === "confirmed" || b.status === "checked-in",
    );
    const earned = state.bookings
      .filter((b) => b.status !== "cancelled")
      .reduce((n, b) => n + b.fee, 0);
    return (
      <div className="stats-grid">
        <div>
          <span>
            {role === "owner" ? "My properties" : "Listed properties"}
          </span>
          <strong>{state.properties.length}</strong>
          <small>
            {state.properties.filter((p) => p.verified).length} verified
          </small>
        </div>
        <div>
          <span>Active bookings</span>
          <strong>{active.length}</strong>
          <small>Across all stay types</small>
        </div>
        <div>
          <span>
            {role === "admin" ? "Platform earnings" : "Advances to release"}
          </span>
          <strong>
            {money(
              role === "admin"
                ? earned
                : state.bookings
                    .filter((b) => b.payout === "eligible")
                    .reduce((n, b) => n + b.advance, 0),
            )}
          </strong>
          <small>Simulated amounts</small>
        </div>
        <div>
          <span>Occupied beds</span>
          <strong>
            {state.bookings.filter(
              (b) => b.status === "checked-in" && !b.moveOutConfirmed,
            ).length +
              state.properties.reduce(
                (n, p) => n + p.rooms.reduce((v, r) => v + r.offline, 0),
                0,
              )}
          </strong>
          <small>Includes offline residents</small>
        </div>
      </div>
    );
  }

  function bookingCard(b: Booking) {
    const p = propertyFor(b);
    const room = p.rooms.find((r) => r.id === b.roomId)!;
    return (
      <article className="booking-card" key={b.id}>
        <div className="booking-summary">
          <img src={p.image} alt="Illustrative room" />
          <div>
            <div className="booking-label">
              <span>{b.id}</span>
              <span
                className={`badge ${b.status === "cancelled" ? "muted" : ""}`}
              >
                {b.status.replace("-", " ")}
              </span>
            </div>
            <h3>{p.name}</h3>
            <p>
              {p.area} · {room.name} · {stayLabels[b.stay]}
            </p>
            <p>
              <CalendarDays size={14} /> {formatDate(b.start)} —{" "}
              {formatDate(b.end)}
            </p>
          </div>
          <div className="booking-price">
            <strong>{money(b.total)}</strong>
            <small>Total booking price</small>
            <span>{money(b.advance + b.fee)} simulated payment</span>
          </div>
        </div>
        <div className="booking-extra">
          {role !== "customer" && <div className="booking-contact" aria-label="Customer booking details">
            <div><small>Customer name</small><strong>{b.customerName || "Not recorded for this earlier booking"}</strong></div>
            <div><small>Mobile number</small>{b.customerMobile ? <a href={`tel:${b.customerMobile}`}>{b.customerMobile}</a> : <span>Not recorded</span>}</div>
            <div><small>Booked on</small><time dateTime={b.created}>{formatBookingTime(b.created)}</time></div>
          </div>}
          {b.status === "checked-in" && b.stay === "monthly" && (
            <p className="notice">
              <CalendarDays size={16} />
              First rent period ends {formatDate(b.end)}. Arrange further rent
              directly with the owner. Your bed stays occupied until a move-out
              date is confirmed.
            </p>
          )}
          {b.status === "confirmed" && role === "customer" && (
            <div className="checkin-code">
              <ShieldCheck size={21} />
              <div>
                <small>Your check-in code</small>
                <strong>{b.code}</strong>
                <p>Share at the property after you arrive.</p>
              </div>
              <button
                className="icon-btn"
                aria-label="Copy check-in code"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(b.code)
                    .then(() => notify("Check-in code copied."))
                    .catch(() => notify(`Your code: ${b.code}`));
                }}
              >
                <Copy size={16} />
              </button>
            </div>
          )}
          <div className="balance">
            <span>Balance at property</span>
            <strong>{money(b.due)}</strong>
            <small>Security deposit: {money(p.deposit)} separately</small>
          </div>
          {b.moveOutRequested && (
            <p className="notice">
              Move-out requested for {formatDate(b.moveOutRequested)} ·{" "}
              {b.moveOutConfirmed
                ? "Owner confirmed"
                : "Awaiting owner confirmation"}
            </p>
          )}
          {b.changeRequested && (
            <p className="notice">
              New check-in requested: {formatDate(b.changeRequested)} · Pending
              owner approval
            </p>
          )}
          {b.refund > 0 && (
            <p className="notice">Simulated refund: {money(b.refund)}</p>
          )}
        </div>
        <div className="booking-actions">
          {role === "customer" ? (
            <>
              {b.status === "confirmed" && (
                <>
                  <button
                    className="btn small"
                    onClick={() => setModal({ type: "change", b })}
                  >
                    Change dates
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() => setModal({ type: "cancel", b })}
                  >
                    Cancel booking
                  </button>
                </>
              )}
              {b.status === "checked-in" &&
                b.stay === "monthly" &&
                !b.moveOutConfirmed && (
                  <button
                    className="btn small"
                    onClick={() => setModal({ type: "moveout", b })}
                  >
                    Plan move-out
                  </button>
                )}
              {(b.status === "checked-in" || b.status === "completed") &&
                !b.review && (
                  <button
                    className="btn small"
                    onClick={() => setModal({ type: "review", b })}
                  >
                    <Star size={15} />
                    Write a review
                  </button>
                )}
              {b.review && (
                <span className="muted-text">
                  Your review: {b.review.rating}/5
                </span>
              )}
              <button
                className="btn small ghost"
                onClick={() => setModal(demoSession ? { type: "chat", p } : { type: "login" })}
              >
                <MessageCircle size={15} />
                Message owner
              </button>
              <button
                className="btn small ghost"
                onClick={() => setModal({ type: "complaint", bookingId: b.id })}
              >
                Get help
              </button>
            </>
          ) : (
            <>
              {b.status === "confirmed" && role === "owner" && (
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const code = String(new FormData(e.currentTarget).get("code"));
                    try {
                      await demo.mutate("check-in", {id:b.id,code});
                      notify("Demo check-in confirmed. Advance is eligible for simulated payout.");
                    } catch (error) {notify(error instanceof Error ? error.message : "Check-in failed.");}
                  }}
                >
                  <input
                    aria-label="Customer check-in code"
                    name="code"
                    placeholder="6-digit check-in code"
                    required
                    pattern="[0-9]{6}"
                  />
                  <button className="btn small primary" disabled={demo.pending}>Confirm arrival</button>
                </form>
              )}
              {b.status === "confirmed" && role === "owner" && (
                <button
                  className="btn small ghost"
                  disabled={
                    Date.now() < Date.parse(`${b.start}T23:59:00+05:30`)
                  }
                  onClick={() => {
                    patchBooking(b.id, { status: "no-show", payout: "held" });
                    notify(
                      "No-show sent to support. The advance stays on hold until support contacts the customer.",
                    );
                  }}
                >
                  Report no-show
                </button>
              )}
              {b.moveOutRequested &&
                !b.moveOutConfirmed &&
                role === "owner" && (
                  <button
                    className="btn small primary"
                    onClick={() => {
                      patchBooking(b.id, {
                        moveOutConfirmed: b.moveOutRequested,
                      });
                      notify(
                        "Move-out confirmed. This bed is available from that date.",
                      );
                    }}
                  >
                    Confirm move-out
                  </button>
                )}
              {b.changeRequested && role === "owner" && (
                <>
                  <button
                    className="btn small"
                    onClick={() => {
                      const newEnd =
                        b.stay === "monthly"
                          ? addMonth(b.changeRequested!)
                          : addDays(b.changeRequested!, nights(b.start, b.end));
                      if (
                        available(
                          room,
                          state.bookings.filter((x) => x.id !== b.id),
                          b.changeRequested!,
                          newEnd,
                          b.stay,
                        ) < 1
                      ) {
                        notify("No bed is available for those dates.");
                        return;
                      }
                      patchBooking(b.id, {
                        start: b.changeRequested,
                        end: newEnd,
                        changeRequested: undefined,
                      });
                      notify(
                        "Dates approved. Support will handle any price difference.",
                      );
                    }}
                  >
                    Approve new dates
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() =>
                      patchBooking(b.id, { changeRequested: undefined })
                    }
                  >
                    Decline
                  </button>
                </>
              )}
              {b.status === "confirmed" && (
                <button
                  className="btn small ghost"
                  onClick={() => {
                    patchBooking(b.id, {
                      status: "cancelled",
                      refund: b.advance + b.fee,
                      payout: "held",
                    });
                    notify(
                      "Provider cancellation: full online payment refunded in demo.",
                    );
                  }}
                >
                  Provider cancellation
                </button>
              )}
              {b.status === "no-show" && role === "admin" && (
                <>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={!!b.supportContacted}
                      onChange={(e) =>
                        patchBooking(b.id, {
                          supportContacted: e.target.checked,
                        })
                      }
                    />
                    Support contacted customer
                  </label>
                  <button
                    className="btn small primary"
                    disabled={!b.supportContacted || b.payout !== "held"}
                    onClick={() => patchBooking(b.id, { payout: "eligible" })}
                  >
                    Approve no-show payout
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </article>
    );
  }

  function requestBooking(p: Property) {
    if (!demoSession) { setModal({ type: "login" }); return; }
    if (!demoSession.mobile) {setModal({type:"customer-profile",p});return;}
    setModal({ type: "checkout", p, requestId: crypto.randomUUID() });
  }

  function detail(p: Property) {
    const fresh = state.properties.find((x) => x.id === p.id) || p;
    const room = fresh.rooms.find((r) => r.id === roomId) || fresh.rooms[0];
    const q = quote(
      fresh,
      room,
      stay,
      start,
      effectiveEnd,
      withMeals,
      state.feePercent,
      state.feeCap,
    );
    const count = available(room, state.bookings, start, effectiveEnd, stay);
    return (
      <div className="detail-body">
        <>
            <div className="detail-gallery">
              {p.photos.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt={`Sample interior ${i + 1} for ${p.name}`}
                />
              ))}
            </div>
            <div className="detail-intro">
              <span className="badge">
                <ShieldCheck size={13} />
                Verified sample property
              </span>
              <span className="rating">
                <Star size={14} fill="currentColor" />
                {p.rating} · {p.reviews} sample reviews
              </span>
              <h2>{p.name}</h2>
              <p>
                <MapPin size={15} />
                {p.address}
              </p>
              <p>{p.description}</p>
            </div>
            <div className="amenity-grid">
              {p.amenities.map((a) => (
                <span key={a}>
                  {iconFor(a)}
                  {a}
                </span>
              ))}
            </div>
        </>
        <div className="booking-config">
          <div className="tabs compact">
            {(["monthly", "short", "day"] as Stay[])
              .filter((s) => p.rooms.some((r) => r.stays.includes(s)))
              .map((s) => (
                <button
                  key={s}
                  className={stay === s ? "active" : ""}
                  onClick={() => {
                    setStay(s);
                    const next = p.rooms.find((r) => r.stays.includes(s));
                    setRoomId(next!.id);
                  }}
                >
                  {stayLabels[s]}
                </button>
              ))}
          </div>
          <div className="form-grid">
            <label>
              Check-in
              <input
                type="date"
                min={dateISO()}
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (end <= e.target.value) setEnd(addDays(e.target.value, 1));
                }}
              />
            </label>
            <label>
              {stay === "monthly"
                ? "First month ends"
                : stay === "day"
                  ? "Day-stay hours"
                  : "Check-out"}
              {stay === "short" ? (
                <input
                  type="date"
                  min={addDays(start, 1)}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              ) : (
                <div className="readonly-field">
                  {stay === "monthly"
                    ? formatDate(addMonth(start))
                    : `${p.dayStart} – ${p.dayEnd}${p.overnight ? " · overnight allowed" : ""}`}
                </div>
              )}
            </label>
          </div>
          <label>
            Room type
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {p.rooms
                .filter((r) => r.stays.includes(stay))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.ac ? "AC" : "Non-AC"} ·{" "}
                    {available(r, state.bookings, start, effectiveEnd, stay)}{" "}
                    beds available
                  </option>
                ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={withMeals}
              onChange={(e) => setWithMeals(e.target.checked)}
            />{" "}
            Include meals (+
            {money(
              stay === "monthly" ? p.mealPrice : Math.round(p.mealPrice / 30),
            )}
            /{stay === "monthly" ? "month" : "day"})
          </label>
        </div>
        <div className="price-breakdown">
          <div>
            <span>
              Total booking price{" "}
              <small>Inclusive of all platform charges</small>
            </span>
            <strong>{money(q.total)}</strong>
          </div>
          <div>
            <span>Pay now</span>
            <strong>{money(q.payNow)}</strong>
          </div>
          <div>
            <span>Balance at property</span>
            <strong>{money(q.due)}</strong>
          </div>
          <div className="deposit-line">
            <span>Refundable deposit · paid at property</span>
            <span>{money(p.deposit)}</span>
          </div>
        </div>
        <div className="policy-box">
          <ShieldCheck size={19} />
          <div>
            <strong>Cancellation policy</strong>
            <p>
              {p.policy < 0
                ? "This booking is non-refundable."
                : `Cancel at least ${policyName(p.policy)} for a refund of ${money(q.advance)}. ${money(q.fee)} of your online payment is non-refundable.`}{" "}
              Provider cancellation: full online payment refunded.
            </p>
          </div>
        </div>
        {stay === "monthly" && (
          <p className="notice">
            {p.notice} days’ move-out notice required. After the first month,
            arrange rent directly with the owner.
          </p>
        )}
        <>
            <h3>House rules</h3>
            <ul className="rules-list">
              {p.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="contact-row">
              <button
                className="btn"
                onClick={() => setModal(demoSession ? { type: "chat", p } : { type: "login" })}
              >
                <MessageCircle size={17} />
                Chat with owner
              </button>
              <button
                className="btn"
                onClick={() =>
                  notify(
                    "Sample listing: no real provider phone number is connected.",
                  )
                }
              >
                <Phone size={17} />
                Call owner
              </button>
            </div>
            <p className="muted-text">
              Photos, reviews, addresses and contact details are illustrative.
            </p>
        </>
        <div className="detail-footer">
          <div>
            <small>Inclusive total</small>
            <strong>{money(q.total)}</strong>
          </div>
          <button
            className="btn primary"
            disabled={count < 1 || bookingAccessBusy}
            onClick={() => requestBooking(fresh)}
          >
            {bookingAccessBusy
              ? "Checking account…"
              : count < 1
                ? "Unavailable"
                : "Reserve this bed"}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    );
  }

  function inventory() {
    return (
      <>
        {pageHead(
          "Keep walk-ins, current residents, and future availability up to date.",
          <select
            aria-label="Filter property"
            value={ownerProperty}
            onChange={(e) => setOwnerProperty(e.target.value)}
          >
            <option value="all">All properties</option>
            {state.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>,
        )}
        <div className="notice">
          <CircleHelp size={18} />
          Monthly bookings remain occupied until a move-out date is confirmed.
          Offline beds are managed below.
        </div>
        {ownerProps.map((p) => (
          <section className="panel" key={p.id}>
            <div className="section-top">
              <div>
                <h2>{p.name}</h2>
                <p>{p.area}</p>
              </div>
              <span className="badge">{p.category}</span>
            </div>
            <div className="inventory-rows">
              {p.rooms.map((r) => (
                <form
                  key={r.id}
                  className="inventory-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const offline = Number(f.get("offline"));
                    const monthly = Number(f.get("monthly"));
                    const offeredStays = (
                      ["monthly", "short", "day"] as Stay[]
                    ).filter((s) => f.has(`stay-${s}`));
                    if (!offeredStays.length) {
                      notify("Choose at least one stay type for this room.");
                      return;
                    }
                    if (offline > r.capacity) {
                      notify("Occupied offline beds cannot exceed capacity.");
                      return;
                    }
                    const rooms = p.rooms.map((x) =>
                      x.id === r.id
                        ? {
                            ...x,
                            offline,
                            monthly,
                            short: Number(f.get("short")),
                            day: Number(f.get("day")),
                            stays: offeredStays,
                            availableFrom:
                              String(f.get("availableFrom")) || undefined,
                          }
                        : x,
                    );
                    patchProperty(p.id, { rooms });
                    notify("Prices and availability updated immediately.");
                  }}
                >
                  <div>
                    <h3>{r.name}</h3>
                    <p>
                      {r.capacity} total beds · {r.ac ? "AC" : "Non-AC"}
                    </p>
                    <span className="available-dot">
                      {available(
                        r,
                        state.bookings,
                        dateISO(),
                        addDays(dateISO(), 1),
                      )}{" "}
                      available now
                    </span>
                  </div>
                  <label>
                    Offline occupied
                    <input
                      name="offline"
                      type="number"
                      min="0"
                      max={r.capacity}
                      defaultValue={r.offline}
                      required
                    />
                  </label>
                  <label>
                    Offline beds free from
                    <input
                      name="availableFrom"
                      type="date"
                      min={dateISO()}
                      defaultValue={r.availableFrom}
                    />
                  </label>
                  <label>
                    Monthly ₹
                    <input
                      name="monthly"
                      type="number"
                      min="1"
                      defaultValue={r.monthly}
                      required
                    />
                  </label>
                  <label>
                    Nightly ₹
                    <input
                      name="short"
                      type="number"
                      min="1"
                      defaultValue={r.short}
                      required
                    />
                  </label>
                  <label>
                    Day ₹
                    <input
                      name="day"
                      type="number"
                      min="1"
                      defaultValue={r.day}
                      required
                    />
                  </label>
                  <button className="btn small primary">Save</button>
                  <fieldset className="offered-stays">
                    <legend>Offered stay types</legend>
                    <div className="stay-options">
                      {(["monthly", "short", "day"] as Stay[]).map((s) => (
                        <label key={s} className="check-label">
                          <input
                            type="checkbox"
                            name={`stay-${s}`}
                            defaultChecked={r.stays.includes(s)}
                          />
                          {stayLabels[s]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </form>
              ))}
            </div>
          </section>
        ))}
      </>
    );
  }

  function payouts() {
    return (
      <>
        {pageHead(
          "Track advances held, eligible for release, and paid. All transactions are simulated.",
        )}
        <div className="notice">
          <ShieldCheck size={18} />
          Normal payouts become eligible after check-in. No-show payouts require
          support contact and admin approval.
        </div>
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Booking</th>
                <th>Property</th>
                <th>Provider advance</th>
                <th>Platform fee</th>
                <th>Payout status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td>
                  <td>{propertyFor(b).name}</td>
                  <td>{money(b.advance)}</td>
                  <td>{money(b.fee)}</td>
                  <td>
                    <span className="badge">
                      {b.status === "cancelled" ? "Cancelled" : b.payout}
                    </span>
                  </td>
                  <td>
                    {role === "admin" &&
                    b.payout === "eligible" &&
                    b.status !== "cancelled" ? (
                      <button
                        className="btn small"
                        onClick={() => {
                          patchBooking(b.id, { payout: "paid" });
                          notify(
                            "Simulated payout completed. No money was transferred.",
                          );
                        }}
                      >
                        Release demo payout
                      </button>
                    ) : (
                      <span className="muted-text">
                        {b.payout === "held" ? "Awaiting verification" : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  function renderContent() {
    if (page === "discover" || page === "favourites")
      return (
        <>
          <div className="discovery-head">
            <div>
              <span className="eyebrow">A PLACE THAT FEELS LIKE YOU</span>
              <h1>
                {page === "favourites" ? (
                  "Your saved places."
                ) : (
                  <>
                    Find your place.
                    <br />
                    <span>Feel at home.</span>
                  </>
                )}
              </h1>
            </div>
            <div className="welcome-note">
              <span className="mini-icon">
                <Navigation size={21} />
              </span>
              <p>
                A little closer to everything.
                <br />
                <strong>Discover your next stay in Hyderabad.</strong>
              </p>
            </div>
          </div>
          <section className="search-panel" aria-label="Search stays">
            <div className="stay-tabs">
              {(["monthly", "short", "day"] as Stay[]).map((s) => (
                <button
                  key={s}
                  className={stay === s ? "active" : ""}
                  onClick={() => setStay(s)}
                >
                  {s === "monthly" ? (
                    <Building2 size={17} />
                  ) : s === "short" ? (
                    <CalendarDays size={17} />
                  ) : (
                    <Clock3 size={17} />
                  )}{" "}
                  {stayLabels[s]}
                </button>
              ))}
            </div>
            <div className="search-fields">
              <div className="location-field">
                <label htmlFor="search-location">WHERE</label>
                <div>
                  <MapPin size={19} />
                  <select
                    id="search-location"
                    aria-label="Location"
                    value={geo ? "current-location" : area}
                    onChange={(e) => {
                      if (e.target.value === "current-location") return;
                      setArea(e.target.value);
                      setGeo(null);
                    }}
                  >
                    {geo && (
                      <option value="current-location">Current location</option>
                    )}
                    {Object.keys(areas).map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="location-action"
                  onClick={locate}
                  disabled={locationBusy}
                  aria-busy={locationBusy}
                >
                  {locationBusy ? "Getting location…" : "Use current location"}
                </button>
              </div>
              <label>
                <span>CHECK-IN</span>
                <input
                  aria-label="Check-in date"
                  type="date"
                  value={start}
                  min={dateISO()}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (end <= e.target.value)
                      setEnd(addDays(e.target.value, 1));
                  }}
                />
              </label>
              <label>
                <span>{stay === "short" ? "CHECK-OUT" : "STAY LENGTH"}</span>
                {stay === "short" ? (
                  <input
                    aria-label="Check-out date"
                    type="date"
                    value={end}
                    min={addDays(start, 1)}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                ) : (
                  <div className="stay-length">
                    <CalendarDays size={17} />
                    {stay === "monthly"
                      ? "One calendar month"
                      : "Provider-set hours"}
                  </div>
                )}
              </label>
              <label className="keyword-field">
                <span>COLLEGE OR WORKPLACE</span>
                <div>
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a place or landmark"
                    aria-label="Search properties or landmarks"
                  />
                </div>
              </label>
              <button
                className="btn primary search-button"
                aria-label="Find stays"
                onClick={() =>
                  document
                    .getElementById("results")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                <Search size={20} />
                <span>Find stays</span>
              </button>
            </div>
          </section>
          <div className="filter-row">
            <div className="category-tabs">
              {["All", "Men", "Women", "Co-living"].map((c) => (
                <button
                  key={c}
                  className={category === c ? "active" : ""}
                  onClick={() => setCategory(c)}
                >
                  {c === "All" ? "All stays" : c}
                </button>
              ))}
            </div>
            <button
              className="btn filter-button"
              onClick={() => setModal({ type: "filters" })}
            >
              <SlidersHorizontal size={16} />
              Filters
              {(filters.ac ||
                filters.wifi ||
                filters.meals ||
                filters.sharing !== "all" ||
                filters.max !== 20000) && (
                <span className="filter-count">•</span>
              )}
            </button>
          </div>
          <div className="results-head" id="results">
            <div>
              <h2>
                {page === "favourites"
                  ? "Saved for later"
                  : geo
                    ? "Near your location"
                    : area === "All Hyderabad"
                      ? "Available in Hyderabad"
                      : `Stays around ${area}`}
              </h2>
              <p>
                {
                  (page === "favourites"
                    ? list.filter((p) => (!!demoSession && state.favourites.includes(p.id)))
                    : list
                  ).length
                }{" "}
                sample properties · Inclusive prices, no checkout surprises
              </p>
            </div>
            <div className="result-actions">
              <label className="sort-select">
                <ArrowDownUp size={15} />
                <select
                  aria-label="Sort properties"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="nearby">Nearest first</option>
                  <option value="price">Price: low to high</option>
                  <option value="rating">Top rated</option>
                </select>
              </label>
              <div className="view-toggle">
                <button
                  aria-label="List view"
                  className={!mapMode ? "active" : ""}
                  onClick={() => setMapMode(false)}
                >
                  <List size={17} />
                  <span>List</span>
                </button>
                <button
                  aria-label="Map view"
                  className={mapMode ? "active" : ""}
                  onClick={() => setMapMode(true)}
                >
                  <Map size={17} />
                  <span>Map</span>
                </button>
              </div>
            </div>
          </div>
          <div className={`results-layout ${mapMode ? "with-map" : ""}`}>
            <div className="property-grid">
              {(page === "favourites"
                ? list.filter((p) => (!!demoSession && state.favourites.includes(p.id)))
                : list
              ).map(card)}
              {(page === "favourites"
                ? list.filter((p) => (!!demoSession && state.favourites.includes(p.id)))
                : list
              ).length === 0 &&
                empty(
                  "A different search might feel right.",
                  "Try a wider distance, another location, or fewer filters.",
                  <button
                    className="btn"
                    onClick={() => {
                      setFilters({
                        max: 20000,
                        sharing: "all",
                        ac: false,
                        wifi: false,
                        meals: false,
                        radius: 20,
                      });
                      setQuery("");
                      setCategory("All");
                      setArea("All Hyderabad");
                      setGeo(null);
                    }}
                  >
                    Reset search
                  </button>,
                )}
            </div>
            {mapMode && (
              <Suspense fallback={<div className="map-frame" role="status">Loading map…</div>}><MapView
                properties={
                  page === "favourites"
                    ? list.filter((p) => (!!demoSession && state.favourites.includes(p.id)))
                    : list
                }
                onSelect={openProperty}
                priceFor={fromPrice}
              /></Suspense>
            )}
          </div>
          <div className="trust-strip">
            <span>
              <ShieldCheck size={19} />
              Verified properties
            </span>
            <span>
              <Wallet size={19} />
              Transparent inclusive pricing
            </span>
            <span>
              <Phone size={19} />Support workflow demo
            </span>
          </div>
        </>
      );
    if (page === "bookings") {
      const bs = newestBookings.filter(
        (b) =>
          bookingTab === "all" ||
          (bookingTab === "active" &&
            (b.status === "confirmed" || b.status === "checked-in")) ||
          (bookingTab === "past" &&
            (b.status === "cancelled" ||
              b.status === "completed" ||
              b.status === "no-show")),
      );
      return (
        <>
          {pageHead(
            role === "customer"
              ? "Your next chapter, all in one place."
              : "Manage arrivals, move-outs, and booking requests.",
          )}
          <div className="tabs booking-tabs">
            {["all", "active", "past"].map((t) => (
              <button
                key={t}
                className={bookingTab === t ? "active" : ""}
                onClick={() => setBookingTab(t)}
              >
                {t === "all"
                  ? "All bookings"
                  : t === "active"
                    ? "Upcoming & active"
                    : "Past & cancelled"}
              </button>
            ))}
          </div>
          <p className="muted-text">Newest bookings first</p>
          {bs.map(bookingCard)}
          {!bs.length &&
            empty(
              "No bookings here yet.",
              "Find a stay and make a demo booking to try the full flow.",
              <button
                className="btn primary"
                onClick={() => navigate("discover")}
              >
                Explore stays
              </button>,
            )}
        </>
      );
    }
    if (page === "messages") {
      const ids = Array.from(new Set(state.messages.map((m) => m.propertyId)));
      return (
        <>
          {pageHead(
            "Ask about the little things that make a place feel right.",
          )}
          <div className="panel">
            {ids.length
              ? ids.map((id) => {
                  const p = state.properties.find((p) => p.id === id)!;
                  const msg = state.messages
                    .filter((m) => m.propertyId === id)
                    .at(-1)!;
                  return (
                    <button
                      className="conversation-row"
                      key={id}
                      onClick={() => setModal(demoSession ? { type: "chat", p } : { type: "login" })}
                    >
                      <img src={p.image} alt="" />
                      <div>
                        <h3>{p.name}</h3>
                        <p>{msg.text}</p>
                      </div>
                      <ChevronRight size={20} />
                    </button>
                  );
                })
              : empty(
                  "Start a conversation.",
                  "Open any property and choose “Chat with owner”.",
                  <button
                    className="btn"
                    onClick={() =>
                      navigate(role === "customer" ? "discover" : "properties")
                    }
                  >
                    View properties
                  </button>,
                )}
          </div>
        </>
      );
    }
    if (page === "profile")
      return (
        <>
          {pageHead("A few essentials for your next stay.")}
          <section className="panel account-panel">
            <div className="account-avatar">A</div>
            <h2>{state.session?.name}</h2>
            <p>Shared customer demo account</p>
            <p>{demoSession?.mobile || "Mobile number not added"}</p>
            <button className="btn" onClick={()=>setModal({type:"customer-profile"})}>Edit account details</button>
            <p><strong>{demoEmail("customer")}</strong></p>
            <p className="notice">Use sample information only. Other demo visitors can see this account’s bookings, messages and complaints.</p>
            <div className="account-links">
              <button
                className="btn"
                onClick={() => setModal(demoSession ? { type: "complaint" } : { type: "login" })}
              >
                File a complaint
              </button>
              <button
                className="btn"
                onClick={() => setModal({ type: "support" })}
              >
                <Phone size={16} />
                Call support
              </button>

            </div>
          </section>
        </>
      );
    if (page === "overview")
      return (
        <>
          {pageHead(
            role === "owner"
              ? "A clear view of your properties, guests, and upcoming arrivals."
              : "A clear view of LocoRent’s bookings and operations.",
            role === "owner" ? (
              <button
                className="btn primary"
                onClick={() => setModal({ type: "add" })}
              >
                <Plus size={17} />
                Add property
              </button>
            ) : (
              <span className="badge">
                <ShieldCheck size={15} />
                Admin workspace
              </span>
            ),
          )}
          {stats()}
          <div className="overview-columns">
            <section className="panel">
              <div className="section-top">
                <h2>Recent bookings</h2>
                <button
                  className="text-btn"
                  onClick={() => navigate("bookings")}
                >
                  View all
                  <ArrowRight size={16} />
                </button>
              </div>
              {newestBookings.slice(0, 4).map((b) => (
                <button
                  key={b.id}
                  className="activity-row"
                  onClick={() => navigate("bookings")}
                >
                  <span className="activity-icon">
                    <BedDouble size={20} />
                  </span>
                  <div>
                    <h3>{propertyFor(b).name}</h3>
                    <p>
                      {stayLabels[b.stay]} · {formatDate(b.start)}
                    </p>
                  </div>
                  <span className="badge">{b.status}</span>
                </button>
              ))}
            </section>
            <section className="panel">
              <div className="section-top">
                <h2>Needs attention</h2>
                <Bell size={18} />
              </div>
              {role === "admin" ? (
                <>
                  <button
                    className="task-row"
                    onClick={() => navigate("verification")}
                  >
                    <FileCheck2 size={22} />
                    <div>
                      <h3>
                        {
                          state.properties.filter(
                            (p) => !p.verified || p.pendingEdit,
                          ).length
                        }{" "}
                        verification requests
                      </h3>
                      <p>Review properties and major listing edits</p>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="task-row"
                    onClick={() => navigate("complaints")}
                  >
                    <MessageCircle size={22} />
                    <div>
                      <h3>
                        {
                          state.complaints.filter((c) => c.status === "open")
                            .length
                        }{" "}
                        open complaints
                      </h3>
                      <p>Customer support and resolution</p>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="task-row"
                    onClick={() => navigate("bookings")}
                  >
                    <CalendarDays size={22} />
                    <div>
                      <h3>
                        {
                          state.bookings.filter(
                            (b) =>
                              b.changeRequested ||
                              (b.moveOutRequested && !b.moveOutConfirmed),
                          ).length
                        }{" "}
                        guest requests
                      </h3>
                      <p>Confirm move-outs and date changes</p>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="task-row"
                    onClick={() => navigate("inventory")}
                  >
                    <BedDouble size={22} />
                    <div>
                      <h3>Keep availability current</h3>
                      <p>Update walk-ins and upcoming free beds</p>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </section>
          </div>
          <section className="panel">
            <div className="section-top">
              <h2>Property snapshot</h2>
              <button
                className="text-btn"
                onClick={() =>
                  navigate(role === "owner" ? "properties" : "verification")
                }
              >
                Manage
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="snapshot-grid">
              {state.properties.slice(0, 4).map((p) => (
                <div key={p.id} className="snapshot">
                  <img src={p.image} alt="Sample interior" />
                  <div>
                    <h3>{p.name}</h3>
                    <p>{p.area}</p>
                    <span className="badge">
                      {p.paused
                        ? "Paused"
                        : p.verified
                          ? "Live"
                          : "Pending review"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      );
    if (page === "properties" || page === "verification")
      return (
        <>
          {pageHead(
            role === "owner"
              ? "Your spaces, thoughtfully managed."
              : "Approve identity, property documents, and major listing changes.",
            role === "owner" ? (
              <button
                className="btn primary"
                onClick={() => setModal({ type: "add" })}
              >
                <Plus size={18} />
                Add property
              </button>
            ) : null,
          )}
          <div className="notice">
            <AlertCircle size={17} />
            Sample verification only. Uploaded documents are not stored or
            verified in this prototype.
          </div>
          <div className="managed-properties">
            {state.properties.map((p) => (
              <article className="managed-card" key={p.id}>
                {role === "admin" ? (
                  <button
                    className="managed-photo"
                    aria-label={`Review ${p.name}`}
                    onClick={() => setModal({ type: "verification-review", p })}
                  >
                    <img src={p.image} alt={`Sample interior for ${p.name}`} />
                  </button>
                ) : (
                  <img src={p.image} alt="Sample property" />
                )}
                <div>
                  <span className="badge">
                    {p.paused
                      ? "Paused"
                      : p.verified
                        ? "Verified"
                        : "Awaiting verification"}
                  </span>
                  <h2>
                    {role === "admin" ? (
                      <button
                        className="property-review-link"
                        onClick={() =>
                          setModal({ type: "verification-review", p })
                        }
                      >
                        {p.name}
                        <ChevronRight size={18} />
                      </button>
                    ) : (
                      p.name
                    )}
                  </h2>
                  <p>
                    {p.area} · {p.category} ·{" "}
                    {p.rooms.reduce((n, r) => n + r.capacity, 0)} beds
                  </p>
                  {p.pendingEdit && (
                    <p className="notice">
                      Pending name change: {p.pendingEdit}
                    </p>
                  )}
                  <div className="contact-row">
                    {role === "owner" ? (
                      <>
                        <button
                          className="btn small"
                          onClick={() => setModal({ type: "edit", p })}
                        >
                          <Pencil size={15} />
                          Edit settings
                        </button>
                        <button
                          className="btn small"
                          onClick={() => {
                            patchProperty(p.id, { paused: !p.paused });
                            notify(
                              p.paused
                                ? "Property resumed."
                                : "Property paused. Existing bookings are preserved.",
                            );
                          }}
                        >
                          {p.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
                          {p.paused ? "Resume" : "Pause"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`btn small ${!p.verified ? "primary" : ""}`}
                          onClick={() =>
                            setModal({ type: "verification-review", p })
                          }
                        >
                          <Eye size={15} />
                          {p.verified ? "Review property" : "Review & approve"}
                        </button>
                        {p.pendingEdit && (
                          <>
                            <button
                              className="btn small"
                              onClick={() => {
                                patchProperty(p.id, {
                                  name: p.pendingEdit,
                                  pendingEdit: undefined,
                                });
                                notify("Listing edit approved.");
                              }}
                            >
                              Approve edit
                            </button>
                            <button
                              className="btn small ghost"
                              onClick={() =>
                                patchProperty(p.id, { pendingEdit: undefined })
                              }
                            >
                              Reject edit
                            </button>
                          </>
                        )}
                        {p.verified && (
                          <button
                            className="btn small"
                            onClick={() =>
                              patchProperty(p.id, { paused: !p.paused })
                            }
                          >
                            {p.paused ? "Resume" : "Suspend new bookings"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      );
    if (page === "inventory") return inventory();
    if (page === "payouts") return payouts();
    if (page === "complaints")
      return (
        <>
          {pageHead(
            "Customer complaints, tracked from submission to resolution.",
          )}
          <div className="panel">
            {state.complaints.length
              ? state.complaints.map((c) => (
                  <div className="complaint-row" key={c.id}>
                    <div>
                      <span className="badge">{c.status}</span>
                      <h3>{c.subject}</h3>
                      <p>{c.message}</p>
                      <small>
                        {c.bookingId || "General complaint"} · {c.id}
                      </small>
                    </div>
                    {c.status === "open" && (
                      <button
                        className="btn small"
                        onClick={() =>
                          update((s) => ({
                            ...s,
                            complaints: s.complaints.map((x) =>
                              x.id === c.id ? { ...x, status: "resolved" } : x,
                            ),
                          }))
                        }
                      >
                        Mark resolved
                      </button>
                    )}
                  </div>
                ))
              : empty(
                  "All clear for now.",
                  "Customer complaints will appear here for your team to review.",
                )}
          </div>
        </>
      );
    if (page === "settings")
      return (
        <>
          {pageHead(
            "Configure fees for new bookings. Confirmed bookings retain their original prices.",
          )}
          <form
            className="panel settings-panel"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              update((s) => ({
                ...s,
                feePercent: Number(f.get("percent")),
                feeCap: Number(f.get("cap")),
              }));
              notify("Saving demo fee settings…");
            }}
          >
            <h2>Platform booking fee</h2>
            <p>
              Included in customer prices. The financial breakdown is visible to
              providers and admins.
            </p>
            <label>
              Percentage (%)
              <input
                name="percent"
                type="number"
                min="0"
                max="25"
                step=".1"
                defaultValue={state.feePercent}
                required
              />
            </label>
            <label>
              Monthly stay fee cap (₹)
              <input
                name="cap"
                type="number"
                min="0"
                max="5000"
                defaultValue={state.feeCap}
                required
              />
            </label>
            <p className="notice">
              Monthly fees apply to the first month’s rent. Short and day stays
              use the booked stay price. Security deposits are excluded.
            </p>
            <button className="btn primary">Save fee settings</button>
            <button type="button" className="btn ghost" onClick={() => setModal({type:"reset"})}>Reset shared demo data</button>
          </form>
        </>
      );
    if (page === "reports") {
      const bs = state.bookings;
      const rows = [
        ["Bookings", bs.length],
        [
          "Booked stay value",
          money(
            bs
              .filter((b) => b.status !== "cancelled")
              .reduce((n, b) => n + b.base, 0),
          ),
        ],
        [
          "Online collections (simulated)",
          money(bs.reduce((n, b) => n + b.advance + b.fee, 0)),
        ],
        [
          "Platform earnings after refunds",
          money(
            bs.reduce(
              (n, b) => n + b.fee - Math.max(0, b.refund - b.advance),
              0,
            ),
          ),
        ],
        ["Refunds (simulated)", money(bs.reduce((n, b) => n + b.refund, 0))],
        [
          "Provider payouts (simulated)",
          money(
            bs
              .filter((b) => b.payout === "paid")
              .reduce((n, b) => n + b.advance, 0),
          ),
        ],
      ];
      return (
        <>
          {pageHead(
            "A practical view of booking activity and financial performance.",
            <button
              className="btn"
              onClick={() => {
                const csv =
                  "Metric,Value\n" +
                  rows
                    .map((r) =>
                      r
                        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
                        .join(","),
                    )
                    .join("\n");
                const url = URL.createObjectURL(
                  new Blob([csv], { type: "text/csv" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "locorent-demo-report.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={16} />
              Export CSV
            </button>,
          )}
          <div className="report-grid">
            {rows.map(([name, value]) => (
              <div className="panel" key={name}>
                <span className="muted-text">{name}</span>
                <strong className="report-number">{value}</strong>
              </div>
            ))}
          </div>
          <section className="panel">
            <h2>Occupancy by property</h2>
            <p>Current date · offline residents and active app bookings</p>
            {state.properties.map((p) => {
              const total = p.rooms.reduce((n, r) => n + r.capacity, 0);
              const free = p.rooms.reduce(
                (n, r) =>
                  n + available(r, bs, dateISO(), addDays(dateISO(), 1)),
                0,
              );
              return (
                <div className="occupancy-row" key={p.id}>
                  <span>{p.name}</span>
                  <div className="progress-track">
                    <div
                      style={{ width: `${((total - free) / total) * 100}%` }}
                    />
                  </div>
                  <span>
                    {total - free} / {total} beds
                  </span>
                </div>
              );
            })}
          </section>
        </>
      );
    }
    return null;
  }

  function modalContent() {
    if (!modal) return null;
    switch (modal.type) {
      case "customer-profile":
        return <Dialog title="Your account details" onClose={close}><CustomerProfileForm name={demoSession?.name} mobile={demoSession?.mobile} demo onSave={async contact=>{
          await demo.saveProfile(contact);
          if(modal.p)setModal({type:"checkout",p:modal.p,requestId:crypto.randomUUID()});else close();
        }}/></Dialog>;
      case "checkout": {
        const p = state.properties.find(p=>p.id===modal.p.id);
        const r = p?.rooms.find(r=>r.id===roomId) || p?.rooms[0];
        if (!p || !r) return <Dialog title="Stay unavailable" onClose={close}><p>This sample property changed. Please choose another stay.</p></Dialog>;
        const q=quote(p,r,stay,start,effectiveEnd,withMeals,state.feePercent,state.feeCap);
        return <Dialog title="Confirm your test booking" onClose={close}><div className="dialog-form">
          <p className="notice"><strong>Demo payment</strong> · No money will be charged. No card or UPI details are needed.</p>
          <p><strong>Booking for {demoSession?.name}</strong><br/>{demoSession?.mobile} · From your account</p>
          <h3>{p.name}</h3><p>{r.name} · {stayLabels[stay]}<br/>{formatDate(start)} – {formatDate(effectiveEnd)}</p>
          <div className="demo-price"><span>Reservation amount (simulated)</span><strong>{money(q.payNow)}</strong></div>
          <div className="demo-price"><span>Remaining stay amount at property</span><strong>{money(q.due)}</strong></div>
          <p>Security deposit: {money(p.deposit)} at the property. Cancellation: {policyName(p.policy)}. All amounts in this demo are simulated.</p>
          <button className="btn primary full" disabled={bookingAccessBusy || demo.pending} onClick={async()=>{
            if(bookingAccessBusy)return;setBookingAccessBusy(true);
            try {await demo.book({propertyId:p.id,roomId:r.id,stay,start,end:effectiveEnd,meals:withMeals,requestId:modal.requestId});close();setPage("bookings");notify("Test booking confirmed. No money was charged. Your check-in code is in My bookings.");}
            catch(error){notify(error instanceof Error?error.message:"Booking failed.");}
            finally{setBookingAccessBusy(false);}
          }}>{bookingAccessBusy?"Confirming…":"Confirm test booking — no payment"}</button>
        </div></Dialog>;
      }
      case "login":
        return (
          <Dialog title="Your next stay starts here" onClose={close}>
            <div className="dialog-form">
              <p>Log in with your email and password to continue. Use the preconfigured customer demo credentials. Browsing stays is free and does not require login.</p>
              <a className="btn primary full" href={accountUrl}>Log in to customer demo <ArrowRight size={17} /></a>
              <p className="notice">Test bookings use shared sample data. No real reservation or payment is made.</p>
              <button className="text-btn" onClick={close}>Keep browsing</button>
            </div>
          </Dialog>
        );
      case "verification-review": {
        const p =
          state.properties.find((item) => item.id === modal.p.id) || modal.p;
        return (
          <Dialog title={`Review ${p.name}`} onClose={close} wide>
            <div className="verification-review detail-body">
              <div className="detail-gallery">
                {p.photos.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={`Sample interior ${i + 1} for ${p.name}`}
                  />
                ))}
              </div>
              <div className="detail-intro">
                <span className="badge">
                  {p.verified
                    ? "Verified sample property"
                    : "Awaiting verification"}
                </span>
                <h2>{p.name}</h2>
                <p>
                  <MapPin size={15} />
                  {p.address}
                </p>
                <p>
                  {p.area} · {p.category} ·{" "}
                  {p.rooms.reduce((sum, room) => sum + room.capacity, 0)} beds
                </p>
                <p>{p.description}</p>
              </div>
              {p.pendingEdit && (
                <div className="notice">
                  <Pencil size={17} />
                  Proposed name: {p.pendingEdit}. Current published name:{" "}
                  {p.name}.
                </div>
              )}
              <section
                className="review-section"
                aria-label="Provider and documents"
              >
                <h3>Provider & documents</h3>
                <p>
                  Provider: Demo owner · One sample account manages these
                  properties.
                </p>
                <div className="notice">
                  <AlertCircle size={17} />
                  Demo only. Identity and ownership documents are not uploaded
                  or stored. Approval here tests the listing workflow; it does
                  not verify a real owner or property.
                </div>
                <dl className="review-facts">
                  <div>
                    <dt>Identity document</dt>
                    <dd>Not available in this demo</dd>
                  </div>
                  <div>
                    <dt>Ownership / management proof</dt>
                    <dd>Not available in this demo</dd>
                  </div>
                  <div>
                    <dt>Provider phone</dt>
                    <dd>{p.phone || "Not provided in sample data"}</dd>
                  </div>
                  <div>
                    <dt>Nearby college / landmark</dt>
                    <dd>{p.landmark}</dd>
                  </div>
                </dl>
              </section>
              <section
                className="review-section"
                aria-label="Room inventory and pricing"
              >
                <h3>Rooms, beds & provider prices</h3>
                <p>
                  Rent is per person. Platform fees are calculated separately
                  for customer bookings.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Room type</th>
                        <th>Beds</th>
                        <th>Offline occupied</th>
                        <th>Monthly</th>
                        <th>Per night</th>
                        <th>Day stay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.rooms.map((r) => (
                        <tr key={r.id}>
                          <td>
                            {r.name}
                            <small className="review-room-meta">
                              {r.ac ? "AC" : "Non-AC"} ·{" "}
                              {r.stays.map((s) => stayLabels[s]).join(", ")}
                            </small>
                          </td>
                          <td>{r.capacity}</td>
                          <td>{r.offline}</td>
                          <td>
                            {r.stays.includes("monthly")
                              ? money(r.monthly)
                              : "Not offered"}
                          </td>
                          <td>
                            {r.stays.includes("short")
                              ? money(r.short)
                              : "Not offered"}
                          </td>
                          <td>
                            {r.stays.includes("day")
                              ? money(r.day)
                              : "Not offered"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section
                className="review-section"
                aria-label="Amenities and rules"
              >
                <h3>Amenities & house rules</h3>
                <div className="amenity-grid">
                  {p.amenities.map((a) => (
                    <span key={a}>
                      {iconFor(a)}
                      {a}
                    </span>
                  ))}
                </div>
                <ul className="review-rules">
                  {p.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
                <dl className="review-facts">
                  <div>
                    <dt>Security deposit</dt>
                    <dd>{money(p.deposit)} at property</dd>
                  </div>
                  <div>
                    <dt>Monthly meal add-on</dt>
                    <dd>{money(p.mealPrice)}</dd>
                  </div>
                  <div>
                    <dt>Cancellation cutoff</dt>
                    <dd>{policyName(p.policy)}</dd>
                  </div>
                  <div>
                    <dt>Move-out notice</dt>
                    <dd>{p.notice} days</dd>
                  </div>
                  <div>
                    <dt>Day stay hours</dt>
                    <dd>
                      {p.dayStart}–{p.dayEnd}
                      {p.overnight ? " · Overnight allowed" : ""}
                    </dd>
                  </div>
                  {(["monthly", "short", "day"] as Stay[]).map((s) => (
                    <div key={s}>
                      <dt>{stayLabels[s]} advance</dt>
                      <dd>
                        {p.advances[s].kind === "percent"
                          ? `${p.advances[s].value}%`
                          : money(p.advances[s].value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <div className="review-actions">
                <button className="btn" onClick={close}>
                  Back to verification
                </button>
                {p.pendingEdit && (
                  <button
                    className="btn"
                    onClick={() => {
                      patchProperty(p.id, {
                        name: p.pendingEdit,
                        pendingEdit: undefined,
                      });
                      close();
                      notify("Listing edit approved.");
                    }}
                  >
                    Approve name change
                  </button>
                )}
                {!p.verified && (
                  <button
                    className="btn primary"
                    onClick={() => {
                      patchProperty(p.id, { verified: true });
                      close();
                      notify(
                        "Sample property approved. It can now appear in search.",
                      );
                    }}
                  >
                    <CheckCircle2 size={18} />
                    Approve sample property
                  </button>
                )}
              </div>
            </div>
          </Dialog>
        );
      }
      case "detail":
        return (
          <Dialog title="Your next place" onClose={close} wide>
            {detail(modal.p)}
          </Dialog>
        );
      case "account-required":
        return (
          <Dialog title="Customer account required" onClose={close}>
            <div className="dialog-form">
              <p>{modal.reason === "setup" ? "Complete your customer account setup before continuing." : "Log in with your separate customer account to reserve a stay."}</p>
              <a className="btn primary full" href="/?account=1">Open customer account <ArrowRight size={17} /></a>
              <button className="text-btn" onClick={close}>Keep browsing</button>
            </div>
          </Dialog>
        );
      case "booking-unavailable":
        return (
          <Dialog title="Online booking is coming soon" onClose={close}>
            <div className="dialog-form">
              <p>Your customer account is verified. These properties are samples; live reservations and payments are still being connected.</p>
              <p className="notice">No booking has been made and no payment has been taken.</p>
              <button className="btn primary full" onClick={close}>Keep browsing</button>
            </div>
          </Dialog>
        );
      case "filters":
        return (
          <Dialog title="A stay that fits you" onClose={close}>
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setFilters({
                  max: Number(f.get("max")),
                  sharing: String(f.get("sharing")),
                  ac: f.has("ac"),
                  wifi: f.has("wifi"),
                  meals: f.has("meals"),
                  radius: Number(f.get("radius")),
                });
                close();
              }}
            >
              <label>
                Maximum inclusive price (₹)
                <input
                  name="max"
                  type="number"
                  min="100"
                  max="100000"
                  defaultValue={filters.max}
                />
              </label>
              <label>
                Room sharing
                <select name="sharing" defaultValue={filters.sharing}>
                  <option value="all">Any room type</option>
                  <option value="1">Private room</option>
                  <option value="2">2 sharing</option>
                  <option value="3">3 sharing</option>
                </select>
              </label>
              <label>
                Distance from selected area / location
                <select name="radius" defaultValue={filters.radius}>
                  <option value="2">Within 2 km</option>
                  <option value="5">Within 5 km</option>
                  <option value="10">Within 10 km</option>
                  <option value="20">Within 20 km</option>
                  <option value="50">Within 50 km</option>
                </select>
              </label>
              <h3>Essentials</h3>
              {[
                ["ac", "Air conditioning"],
                ["wifi", "Wi-Fi"],
                ["meals", "Meals included in price"],
              ].map(([k, l]) => (
                <label className="check-label" key={k}>
                  <input
                    name={k}
                    type="checkbox"
                    defaultChecked={Boolean(filters[k as keyof typeof filters])}
                  />
                  {l}
                </label>
              ))}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setFilters({
                      max: 20000,
                      sharing: "all",
                      ac: false,
                      wifi: false,
                      meals: false,
                      radius: 20,
                    });
                    close();
                  }}
                >
                  Reset
                </button>
                <button className="btn primary">
                  Show stays
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </Dialog>
        );
      case "chat": {
        const msgs = state.messages.filter((m) => m.propertyId === modal.p.id);
        return (
          <Dialog title={modal.p.name} onClose={close}>
            <div className="chat-body">
              <p className="notice">
                Demo conversation · messages stay in this browser and are not
                sent to a real provider.
              </p>
              <div className="chat-history">
                {!msgs.length && (
                  <div className="chat-bubble owner">
                    Hello! Ask about meals, house rules, or arranging a visit.
                    This is a sample chat.
                  </div>
                )}
                {msgs.map((m) => (
                  <div className={`chat-bubble ${m.from}`} key={m.id}>
                    <small>
                      {m.from === role
                        ? "You"
                        : m.from === "owner"
                          ? "Property owner"
                          : "Guest"}
                    </small>
                    {m.text}
                  </div>
                ))}
              </div>
              <form
                className="chat-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const text = String(f.get("message")).trim();
                  if (!text) return;
                  update((s) => ({
                    ...s,
                    messages: [
                      ...s.messages,
                      {
                        id: crypto.randomUUID(),
                        propertyId: modal.p.id,
                        text,
                        from: role === "owner" ? "owner" : "customer",
                        time: new Date().toISOString(),
                      },
                    ],
                  }));
                  e.currentTarget.reset();
                }}
              >
                <input
                  name="message"
                  aria-label="Message"
                  placeholder="Ask about your stay…"
                  maxLength={1000}
                  required
                />
                <button className="btn primary" aria-label="Send demo message">
                  <Send size={18} />
                </button>
              </form>
            </div>
          </Dialog>
        );
      }
      case "complaint":
        return (
          <Dialog title="We’re here to help" onClose={close}>
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                update((s) => ({
                  ...s,
                  complaints: [
                    {
                      id: `CMP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
                      subject: String(f.get("subject")),
                      message: String(f.get("message")),
                      bookingId: modal.bookingId,
                      status: "open",
                    },
                    ...s.complaints,
                  ],
                }));
                close();
                notify(
                  "Demo complaint submitted. Switch to Admin → Complaints to review it.",
                );
              }}
            >
              <p>
                Tell us what happened. Your complaint will appear in the admin
                workspace.
              </p>
              <label>
                What is this about?
                <select name="subject">
                  <option>Booking issue</option>
                  <option>Misleading listing</option>
                  <option>Payment or refund</option>
                  <option>Property condition</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Details
                <textarea
                  name="message"
                  rows={4}
                  required
                  minLength={5}
                  maxLength={2000}
                  placeholder="Describe the issue…"
                />
              </label>
              <button className="btn primary">Submit demo complaint</button>
              <button
                className="btn"
                type="button"
                onClick={() => setModal({ type: "support" })}
              >
                <Phone size={17} />
                Need immediate help? Call support
              </button>
            </form>
          </Dialog>
        );
      case "cancel": {
        const refund = refundFor(modal.b);
        return (
          <Dialog title="Cancel your booking?" onClose={close}>
            <div className="dialog-form">
              <p>
                {propertyFor(modal.b).name} · {modal.b.id}
              </p>
              <div className="price-breakdown">
                <div>
                  <span>Paid online</span>
                  <strong>{money(modal.b.advance + modal.b.fee)}</strong>
                </div>
                <div>
                  <span>Your refund</span>
                  <strong>{money(refund)}</strong>
                </div>
                <div>
                  <span>Non-refundable amount</span>
                  <strong>
                    {money(modal.b.advance + modal.b.fee - refund)}
                  </strong>
                </div>
              </div>
              <p className="notice">
                Policy: {policyName(modal.b.policy)}. The platform charge is
                retained on customer cancellations.
              </p>
              <div className="form-actions">
                <button className="btn" onClick={close}>
                  Keep booking
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    patchBooking(modal.b.id, {
                      status: "cancelled",
                      refund,
                      payout: "held",
                    });
                    close();
                    notify("Demo booking cancelled. Availability updated.");
                  }}
                >
                  Confirm cancellation
                </button>
              </div>
            </div>
          </Dialog>
        );
      }
      case "moveout":
        return (
          <Dialog title="Plan your move-out" onClose={close}>
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const date = String(new FormData(e.currentTarget).get("date"));
                patchBooking(modal.b.id, { moveOutRequested: date });
                close();
                notify(
                  "Move-out notice sent. Availability changes only after owner confirmation.",
                );
              }}
            >
              <p>
                {propertyFor(modal.b).notice} days’ notice is required. The
                owner must confirm your date before the bed becomes bookable.
              </p>
              <label>
                Planned move-out date
                <input
                  name="date"
                  type="date"
                  min={addDays(dateISO(), propertyFor(modal.b).notice)}
                  required
                />
              </label>
              <button className="btn primary">Send move-out notice</button>
            </form>
          </Dialog>
        );
      case "change":
        return (
          <Dialog title="Request new check-in date" onClose={close}>
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                patchBooking(modal.b.id, {
                  changeRequested: String(
                    new FormData(e.currentTarget).get("date"),
                  ),
                });
                close();
                notify(
                  "Date change requested. Owner approval is required; support handles any price difference.",
                );
              }}
            >
              <p>
                Changes depend on availability and owner approval. Your current
                dates remain reserved until approved.
              </p>
              <label>
                New check-in date
                <input name="date" type="date" min={dateISO()} required />
              </label>
              <button className="btn primary">Send request</button>
            </form>
          </Dialog>
        );
      case "review":
        return (
          <Dialog title="How was your stay?" onClose={close}>
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                patchBooking(modal.b.id, {
                  review: {
                    rating: Number(f.get("rating")),
                    text: String(f.get("text")),
                  },
                });
                close();
                notify("Your verified-guest demo review has been saved.");
              }}
            >
              <p>Reviews are available only after confirmed check-in.</p>
              <label>
                Your rating
                <select name="rating">
                  <option value="5">5 — Excellent</option>
                  <option value="4">4 — Good</option>
                  <option value="3">3 — Okay</option>
                  <option value="2">2 — Could be better</option>
                  <option value="1">1 — Poor</option>
                </select>
              </label>
              <label>
                Your experience
                <textarea name="text" rows={4} required maxLength={1500} />
              </label>
              <button className="btn primary">Submit review</button>
            </form>
          </Dialog>
        );
      case "edit":
        return (
          <Dialog title="Property settings" onClose={close}>
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  (["monthly", "short", "day"] as Stay[]).some(
                    (s) =>
                      f.get(`${s}-kind`) === "percent" &&
                      Number(f.get(`${s}-value`)) > 100,
                  )
                ) {
                  notify("Percentage advances must be between 1% and 100%.");
                  return;
                }
                if (
                  !f.has("overnight") &&
                  String(f.get("dayEnd")) <= String(f.get("dayStart"))
                ) {
                  notify(
                    "Same-day check-out must be after check-in. Enable overnight use for an overnight slot.",
                  );
                  return;
                }
                const advances = { ...modal.p.advances };
                (["monthly", "short", "day"] as Stay[]).forEach((s) => {
                  advances[s] = {
                    kind: String(f.get(`${s}-kind`)) as "fixed" | "percent",
                    value: Number(f.get(`${s}-value`)),
                  };
                });
                patchProperty(modal.p.id, {
                  pendingEdit:
                    String(f.get("name")) !== modal.p.name
                      ? String(f.get("name"))
                      : modal.p.pendingEdit,
                  policy: Number(f.get("policy")),
                  notice: Number(f.get("notice")),
                  dayStart: String(f.get("dayStart")),
                  dayEnd: String(f.get("dayEnd")),
                  overnight: f.has("overnight"),
                  deposit: Number(f.get("deposit")),
                  mealPrice: Number(f.get("mealPrice")),
                  rules: String(f.get("rules"))
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  advances,
                });
                close();
                notify(
                  "Settings saved. Major name changes await admin approval.",
                );
              }}
            >
              <label>
                Property name <small>Changes require admin approval</small>
                <input name="name" defaultValue={modal.p.name} required />
              </label>
              <label>
                Cancellation policy
                <select name="policy" defaultValue={modal.p.policy}>
                  {[24, 72, 168, -1].map((v) => (
                    <option value={v} key={v}>
                      {policyName(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Move-out notice (days)
                <input
                  name="notice"
                  type="number"
                  min="0"
                  max="90"
                  defaultValue={modal.p.notice}
                  required
                />
              </label>
              <h3>Advance by stay type</h3>
              <div className="form-grid">
                <label>
                  Security deposit (₹)
                  <input
                    name="deposit"
                    type="number"
                    min="0"
                    defaultValue={modal.p.deposit}
                    required
                  />
                </label>
                <label>
                  Monthly meal add-on (₹)
                  <input
                    name="mealPrice"
                    type="number"
                    min="0"
                    defaultValue={modal.p.mealPrice}
                    required
                  />
                </label>
              </div>
              <label>
                House rules (one per line)
                <textarea
                  name="rules"
                  rows={4}
                  defaultValue={modal.p.rules.join("\n")}
                  required
                />
              </label>
              {(["monthly", "short", "day"] as Stay[]).map((s) => (
                <div className="form-grid" key={s}>
                  <label>
                    {stayLabels[s]} advance
                    <select
                      name={`${s}-kind`}
                      defaultValue={modal.p.advances[s].kind}
                    >
                      <option value="fixed">Fixed rupees</option>
                      <option value="percent">Percentage</option>
                    </select>
                  </label>
                  <label>
                    Amount / percent
                    <input
                      name={`${s}-value`}
                      type="number"
                      min="1"
                      max={100000}
                      defaultValue={modal.p.advances[s].value}
                      required
                    />
                  </label>
                </div>
              ))}
              <div className="form-grid">
                <label>
                  Day check-in
                  <input
                    name="dayStart"
                    type="time"
                    defaultValue={modal.p.dayStart}
                    required
                  />
                </label>
                <label>
                  Day check-out
                  <input
                    name="dayEnd"
                    type="time"
                    defaultValue={modal.p.dayEnd}
                    required
                  />
                </label>
              </div>
              <label className="check-label">
                <input
                  name="overnight"
                  type="checkbox"
                  defaultChecked={modal.p.overnight}
                />
                Day stay may include overnight use
              </label>
              <button className="btn primary">Save settings</button>
            </form>
          </Dialog>
        );
      case "add":
        return (
          <Dialog title="Add your next property" onClose={close} wide>
            <Suspense fallback={<p className="dialog-form" role="status">Opening property form…</p>}><AddPropertyForm onSubmit={async (property) => {
              await demo.update((s) => ({...s, properties: [...s.properties, property]}));
              close();
              notify("Property submitted. It will appear in search after admin verification.");
            }}/></Suspense>
          </Dialog>
        );
      case "support":
        return (
          <Dialog title="Talk to LocoRent" onClose={close}>
            <div className="dialog-form">
              <span className="support-icon">
                <Phone size={28} />
              </span>
              <h3>A person on the other end.</h3>
              <p>
                Phone support will be available here once you provide the
                LocoRent support number. No real number is connected in this
                prototype.
              </p>
              <button
                className="btn primary"
                onClick={() => setModal(demoSession ? { type: "complaint" } : { type: "login" })}
              >
                File a demo complaint instead
              </button>
            </div>
          </Dialog>
        );
      case "navigation":
        return (
          <Dialog title="Your workspace" onClose={close}>
            <div className="dialog-form">
              {nav.map((n) => (
                <button
                  key={n.id}
                  className="btn"
                  onClick={() => {
                    navigate(n.id);
                    close();
                  }}
                >
                  <n.icon size={18} />
                  {n.label}
                </button>
              ))}
              <button
                className="btn ghost"
                onClick={() => {
                  if (!demoSession) { window.location.assign(accountUrl); return; }
                  void demo.logout();
                  setPage(role === "customer" ? "discover" : "overview");
                  close();
                }}
              >
                <LogOut size={17} />
                {demoSession ? "Log out" : "Demo login"}
              </button>
            </div>
          </Dialog>
        );
      case "reset":
        return (
          <Dialog title="Reset the shared demo?" onClose={close}>
            <div className="dialog-form">
              <p>
                This resets sample bookings, messages, complaints and property edits for every demo visitor. Original sample properties are restored. Real business records are unaffected.
              </p>
              <button
                className="btn primary"
                disabled={demo.pending}
                onClick={async () => {
                  try {await demo.mutate("reset");setPage("overview");close();notify("Shared samples restored.");}
                  catch(error){notify(error instanceof Error?error.message:"Reset failed.");}
                }}
              >
                Reset sample data
              </button>
            </div>
          </Dialog>
        );
    }
  }

  if (role !== "customer" && demo.ready && !demoSession) return <DemoAccount portal={role}/>;
  if (!demo.ready) return <div className="demo-loading" role="status"><Brand/><p>Opening the shared demo…</p></div>;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand-button"
          onClick={() =>
            navigate(role === "customer" ? "discover" : "overview")
          }
        >
          <Brand />
        </button>
        <div className="workspace-label">
          {role === "customer"
            ? "FIND YOUR SPACE"
            : role === "owner"
              ? "OWNER WORKSPACE"
              : "ADMIN WORKSPACE"}
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {demoSession && n.id === "messages" && state.messages.length > 0 && (
                <span className="nav-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span>
              <CircleHelp size={22} />
            </span>
            <h3>A little help?</h3>
            <p>We’re here for your next move.</p>
            <button
              className="text-btn"
              onClick={() => setModal({ type: "support" })}
            >
              Contact support
              <ArrowRight size={15} />
            </button>
          </div>
          <button
            className="nav-item"
            onClick={() => {
              if (!demoSession) { window.location.assign(accountUrl); return; }
              void demo.logout();
              setPage(role === "customer" ? "discover" : "overview");
            }}
          >
            <LogOut size={18} />
            <span>{demoSession ? "Log out" : "Demo login"}</span>
          </button>
          <div className="sidebar-note">
            Hyderabad, for now.
            <br />A place for everyone.
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="breadcrumb">
            {role === "customer"
              ? "Explore Hyderabad"
              : role === "owner"
                ? "Hosting"
                : "Administration"}
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <a className="text-btn" href={accountUrl}>{demoSession ? "Demo account" : "Demo login"}</a>
            <span className="demo-label">{demoSession ? "DEMO MODE" : "SAMPLE DATA"}</span>
            <button
              className="avatar"
              aria-label="Open account"
              onClick={() =>
                role === "customer"
                  ? navigate("profile")
                  : setModal({ type: "support" })
              }
            >
              {demoSession ? demoSession.name[0].toUpperCase() : <Users size={18} />}
            </button>
          </div>
        </header>
        <div className="shared-demo-banner" role="status">
          <span><strong>Demo</strong> · Sample data · No real payments</span>
          <span>{demo.pending ? "Saving…" : demo.error ? "Connection needs attention" : `Shared data · Updated ${demo.lastSync}`}</span>
        </div>
        {demo.error && <div className="demo-error" role="alert">{demo.error}<button className="text-btn" onClick={() => void demo.refresh()}>Retry</button></div>}
        <main className="main-content" aria-busy={demo.pending} inert={demo.pending}>
          {demo.pending && <p className="demo-saving" role="status">Saving your demo change…</p>}
          {renderContent()}
          <footer className="main-footer">
            <span>© {new Date().getFullYear()} LocoRent</span>
            <span>Sample listings · Simulated transactions</span>
            <button onClick={() => setModal({ type: "support" })}>
              Help & support
            </button>
          </footer>
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.slice(0, 4).map((n) => (
            <button
              className={page === n.id ? "active" : ""}
              key={n.id}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
            </button>
          ))}
          <button onClick={() => setModal({ type: "navigation" })}>
            <Menu size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>
      {modalContent()}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
export default App;
