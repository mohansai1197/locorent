import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Property } from "./domain";
import { money } from "./domain";
export default function MapView({
  properties,
  onSelect,
  priceFor,
}: {
  properties: Property[];
  onSelect: (p: Property) => void;
  priceFor: (p: Property) => number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView(
      [17.4401, 78.39],
      12,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    const points: L.LatLngExpression[] = [];
    properties.forEach((p) => {
      const label = money(priceFor(p));
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "price-marker",
          html: `<span>${label}</span>`,
          iconSize: [86, 36],
          iconAnchor: [43, 18],
        }),
      }).addTo(map);
      marker.on("click", () => onSelect(p));
      marker.bindTooltip(p.name, { direction: "top", offset: [0, -18] });
      points.push([p.lat, p.lng]);
    });
    if (points.length)
      map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 14 });
    return () => {
      map.remove();
    };
  }, [properties, onSelect, priceFor]);
  return (
    <div className="map-frame">
      <div
        ref={ref}
        className="map"
        role="region"
        aria-label="Map of sample Hyderabad properties"
      />
      <div className="map-caption">
        Select a price to explore a stay · Sample locations
      </div>
    </div>
  );
}
