import { describe, expect, it } from 'vitest';
import { buildCheckoutSessionParams, buildPortalSessionParams } from './stripe-api';

describe('buildPortalSessionParams', () => {
	it('passes the configuration explicitly when one is set', () => {
		const params = buildPortalSessionParams({
			customerId: 'cus_1',
			returnUrl: 'https://arelay.app/portal/account',
			configurationId: 'bpc_1'
		});
		expect(params.get('customer')).toBe('cus_1');
		expect(params.get('return_url')).toBe('https://arelay.app/portal/account');
		expect(params.get('configuration')).toBe('bpc_1');
	});

	it('omits configuration when unset so Stripe uses the account default', () => {
		const params = buildPortalSessionParams({
			customerId: 'cus_1',
			returnUrl: 'https://arelay.app/portal/account',
			configurationId: null
		});
		expect(params.has('configuration')).toBe(false);
	});
});

describe('buildCheckoutSessionParams', () => {
	const base = {
		customerId: 'cus_1',
		priceId: 'price_1',
		userId: 'user-1',
		origin: 'https://arelay.app',
		automaticTax: false
	} as const;

	it('builds a subscription session carrying the user id in metadata', () => {
		const params = buildCheckoutSessionParams({
			...base,
			mode: 'subscription',
			plan: 'pro'
		});
		expect(params.get('mode')).toBe('subscription');
		expect(params.get('client_reference_id')).toBe('user-1');
		expect(params.get('metadata[arelay_user_id]')).toBe('user-1');
		expect(params.get('metadata[arelay_plan]')).toBe('pro');
		expect(params.get('subscription_data[metadata][arelay_user_id]')).toBe('user-1');
		expect(params.get('success_url')).toBe('https://arelay.app/portal/account?checkout=success');
	});

	it('builds a one-time founding session with an invoice', () => {
		const params = buildCheckoutSessionParams({
			...base,
			mode: 'payment',
			plan: 'founding'
		});
		expect(params.get('mode')).toBe('payment');
		expect(params.get('metadata[arelay_plan]')).toBe('founding');
		expect(params.get('invoice_creation[enabled]')).toBe('true');
		expect(params.get('payment_intent_data[metadata][arelay_user_id]')).toBe('user-1');
	});

	it('never pins payment_method_types, so dynamic payment methods stay on', () => {
		const params = buildCheckoutSessionParams({ ...base, mode: 'subscription', plan: 'pro' });
		expect(params.has('payment_method_types')).toBe(false);
		expect(params.has('payment_method_types[0]')).toBe(false);
	});

	it('only enables automatic tax when explicitly turned on', () => {
		const off = buildCheckoutSessionParams({ ...base, mode: 'subscription', plan: 'pro' });
		expect(off.has('automatic_tax[enabled]')).toBe(false);

		const on = buildCheckoutSessionParams({
			...base,
			mode: 'subscription',
			plan: 'pro',
			automaticTax: true
		});
		expect(on.get('automatic_tax[enabled]')).toBe('true');
		expect(on.get('customer_update[address]')).toBe('auto');
	});
});
