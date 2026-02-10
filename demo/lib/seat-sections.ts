import type { SeatSection } from "@/components/seat-map";
import type { Resource } from "@/lib/schemas";

export function buildSections(venueId: string, resources: Resource[]): SeatSection[] {
  const children = resources.filter((r) => r.parentId === venueId);
  const sections: SeatSection[] = [];

  for (const child of children) {
    const grandchildren = resources.filter((r) => r.parentId === child.id);
    if (grandchildren.length > 0) {
      sections.push({
        id: child.id,
        name: child.name ?? "",
        price: child.price,
        seats: grandchildren.map((s) => ({ id: s.id, name: s.name ?? s.id })),
      });
    }
  }

  if (sections.length === 0 && children.length > 0) {
    const venue = resources.find((r) => r.id === venueId);
    sections.push({
      id: venueId,
      name: venue?.name ?? "Seats",
      price: venue?.price ?? null,
      seats: children.map((s) => ({ id: s.id, name: s.name ?? s.id })),
    });
  }

  return sections;
}

export function allSeatIds(sections: SeatSection[]): string[] {
  return sections.flatMap((s) => s.seats.map((seat) => seat.id));
}
