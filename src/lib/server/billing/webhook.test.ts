import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
	parseStripeEvent,
	planUpdateFromEvent,
	verifyStripeWebhookSignature
} from './webhook';

const SECRET = 'whsec_test_secret';

function signPayload(payload: string, secret: string, timestamp: number): string {
	const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
	return `t=${timestamp},v1=${signature}`;
}

describe('verifyStripeWebhookSignature', () => {
	const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
	const now = 1_700_000_000;

	it('accepts a valid signature within tolerance', () => {
		const header = signPayload(payload, SECRET, now - 10);
		expect(
			verifyStripeWebhookSignature(payload, header, SECRET, { nowSeconds: now })
		).toBe(true);
	});

	it('accepts when one of several v1 signatures matches', () => {
		const valid = signPayload(payload, SECRET, now).split('v1=')[1];
		const header = `t=${now},v1=${'0'.repeat(64)},v1=${valid}`;
		expect(
			verifyStripeWebhookSignature(payload, header, SECRET, { nowSeconds: now })
		).toBe(true);
	});

	it('rejects a signature made with a different secret', () => {
		const header = signPayload(payload, 'whsec_other', now);
		expect(
			verifyStripeWebhookSignature(payload, header, SECRET, { nowSeconds: now })
		).toBe(false);
	});

	it('rejects a tampered payload', () => {
		const header = signPayload(payload, SECRET, now);
		expect(
			verifyStripeWebhookSignature(payload + 'x', header, SECRET, { nowSeconds: now })
		).toBe(false);
	});

	it('rejects timestamps outside the replay tolerance', () => {
		const header = signPayload(payload, SECRET, now - 10_000);
		expect(
			verifyStripeWebhookSignature(payload, header, SECRET, { nowSeconds: now })
		).toBe(false);
	});

	it('rejects missing or malformed headers', () => {
		expect(verifyStripeWebhookSignature(payload, null, SECRET)).toBe(false);
		expect(verifyStripeWebhookSignature(payload, '', SECRET)).toBe(false);
		expect(verifyStripeWebhookSignature(payload, 't=abc,v1=', SECRET)).toBe(false);
		expect(verifyStripeWebhookSignature(payload, 'v1=deadbeef', SECRET)).toBe(false);
	});
});

describe('parseStripeEvent', () => {
	it('parses a JSON event object', () => {
		expect(parseStripeEvent('{"type":"x"}')).toEqual({ type: 'x' });
	});

	it('returns null for invalid JSON or non-objects', () => {
		expect(parseStripeEvent('not json')).toBeNull();
		expect(parseStripeEvent('"string"')).toBeNull();
		expect(parseStripeEvent('null')).toBeNull();
	});
});

describe('planUpdateFromEvent', () => {
	it('maps a completed founding checkout to a lifetime plan', () => {
		const action = planUpdateFromEvent({
			type: 'checkout.session.completed',
			data: {
				object: {
					mode: 'payment',
					customer: 'cus_1',
					client_reference_id: 'user-1',
					metadata: { arelay_user_id: 'user-1', arelay_plan: 'founding' }
				}
			}
		});
		expect(action).toEqual({
			userId: 'user-1',
			stripeCustomerId: 'cus_1',
			update: { plan: 'founding', planSource: 'lifetime' }
		});
	});

	it('maps a completed subscription checkout to pro', () => {
		const action = planUpdateFromEvent({
			type: 'checkout.session.completed',
			data: {
				object: {
					mode: 'subscription',
					customer: 'cus_1',
					subscription: 'sub_1',
					metadata: { arelay_user_id: 'user-1', arelay_plan: 'pro' }
				}
			}
		});
		expect(action?.update.plan).toBe('pro');
		expect(action?.update.planSource).toBe('subscription');
		expect(action?.update.stripeSubscriptionId).toBe('sub_1');
	});

	it('ignores a payment-mode checkout without the founding marker', () => {
		const action = planUpdateFromEvent({
			type: 'checkout.session.completed',
			data: { object: { mode: 'payment', customer: 'cus_1' } }
		});
		expect(action).toBeNull();
	});

	it('keeps pro through active, trialing, and past_due subscription updates', () => {
		for (const status of ['active', 'trialing', 'past_due']) {
			const action = planUpdateFromEvent({
				type: 'customer.subscription.updated',
				data: {
					object: {
						id: 'sub_1',
						customer: 'cus_1',
						status,
						metadata: { arelay_user_id: 'user-1' },
						items: { data: [{ current_period_end: 1_700_000_000 }] }
					}
				}
			});
			expect(action?.update.plan).toBe('pro');
			expect(action?.update.subscriptionStatus).toBe(status);
			expect(action?.update.currentPeriodEnd).toEqual(new Date(1_700_000_000 * 1000));
		}
	});

	it('reads current_period_end from the subscription top level as fallback', () => {
		const action = planUpdateFromEvent({
			type: 'customer.subscription.updated',
			data: {
				object: {
					id: 'sub_1',
					customer: 'cus_1',
					status: 'active',
					current_period_end: 1_700_000_000
				}
			}
		});
		expect(action?.update.currentPeriodEnd).toEqual(new Date(1_700_000_000 * 1000));
	});

	it('downgrades to free on canceled and unpaid statuses', () => {
		for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'paused']) {
			const action = planUpdateFromEvent({
				type: 'customer.subscription.updated',
				data: { object: { id: 'sub_1', customer: 'cus_1', status } }
			});
			expect(action?.update.plan).toBe('free');
			expect(action?.update.planSource).toBeNull();
		}
	});

	it('treats subscription.deleted as canceled', () => {
		const action = planUpdateFromEvent({
			type: 'customer.subscription.deleted',
			data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } }
		});
		expect(action?.update.plan).toBe('free');
		expect(action?.update.subscriptionStatus).toBe('canceled');
	});

	it('returns null for unhandled event types', () => {
		expect(
			planUpdateFromEvent({ type: 'invoice.payment_failed', data: { object: { id: 'in_1' } } })
		).toBeNull();
		expect(planUpdateFromEvent({ type: 'charge.refunded', data: { object: {} } })).toBeNull();
		expect(planUpdateFromEvent({ type: 'x', data: {} })).toBeNull();
	});
});
