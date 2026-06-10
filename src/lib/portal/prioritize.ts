export function prioritizeBySessionIds<T extends { id: string }>(
	items: T[],
	priorityIds: string[]
): T[] {
	if (priorityIds.length === 0) return items;

	const byId = new Map(items.map((item) => [item.id, item]));
	const seen = new Set<string>();
	const prioritized: T[] = [];

	for (const id of priorityIds) {
		if (seen.has(id)) continue;
		const item = byId.get(id);
		if (!item) continue;
		seen.add(id);
		prioritized.push(item);
	}

	for (const item of items) {
		if (!seen.has(item.id)) prioritized.push(item);
	}

	return prioritized;
}
