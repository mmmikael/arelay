// Dev helper: send sample spend requests through the encrypting client.
//   ARELAY_TOKEN=ar_... ARELAY_URL=http://localhost:5173 node scripts/dev-send-spend.mjs
import { ArelayClient } from '../packages/arelay/dist/index.js';

const client = ArelayClient.fromEnv(process.env);

const samples = [
	{
		payee: 'OpenAI',
		amountMinor: 4900,
		currency: 'usd',
		description: 'Top up API credits — research agent is out of tokens mid-run.',
		idempotencyKey: 'demo-openai-credits'
	},
	{
		payee: 'AWS',
		amountMinor: 23150,
		currency: 'usd',
		description: 'Provision a g5.xlarge GPU box for 6h to fine-tune the ranking model.',
		idempotencyKey: 'demo-aws-gpu'
	},
	{
		payee: 'Vercel Pro',
		amountMinor: 2000,
		currency: 'usd',
		description: 'Upgrade to Pro so the staging preview stops rate-limiting the demo.',
		idempotencyKey: 'demo-vercel-pro'
	}
];

for (const sample of samples) {
	const fmt = `${sample.currency.toUpperCase()} ${(sample.amountMinor / 100).toFixed(2)}`;
	const result = await client.createSpendRequest({
		...sample,
		sessionSummary: `${sample.payee} — ${fmt}`
	});
	console.log(
		`✓ ${sample.payee.padEnd(12)} ${fmt.padEnd(10)} → ${result.request.status}  ${result.portalUrl}`
	);
}
console.log('\nDone — 3 spend requests submitted (all PENDING until approved).');
