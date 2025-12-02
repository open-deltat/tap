import { TapError } from '@tap/core';
import { createBookingRepository, createDatabase } from '@tap/db';
import { BookingsPostRequestBodySchema, createSlotId } from '@tap/protocol';

const connectionString =
	process.env.DATABASE_URL ||
	process.env.POSTGRES_URL ||
	'postgresql://tap:tap@localhost:5432/tap';

const db = createDatabase(connectionString);
const bookingRepository = createBookingRepository(db);

export const handleBookings = async (req: Request): Promise<Response> => {
	const json = await req.json();
	const result = BookingsPostRequestBodySchema.safeParse(json);

	if (!result.success) {
		const error = new TapError(
			'TAP_INVALID_INPUT',
			'Invalid request body',
			result.error.format(),
		);
		return error.toResponse();
	}

	const { tenantId, resourceId, from, to, status } = result.data;

	const fromTs = from ? new Date(from).getTime() : undefined;
	const toTs = to ? new Date(to).getTime() : undefined;

	const allBookings = await bookingRepository.getByResourceId(
		resourceId,
		fromTs,
		toTs,
	);

	const filteredBookings = allBookings.filter((b) => {
		if (b.tenantId !== tenantId) return false;
		if (status === 'ALL' || !status) return true;
		return b.status === status;
	});

	const bookings = filteredBookings.map((b) => ({
		bookingId: b.id,
		slotId: createSlotId(new Date(b.start), new Date(b.end)),
		start: b.start,
		end: b.end,
		status: b.status,
		customerName: b.customerName,
		customerEmail: b.customerEmail,
		createdAt: b.createdAt,
	}));

	return Response.json({ bookings });
};
