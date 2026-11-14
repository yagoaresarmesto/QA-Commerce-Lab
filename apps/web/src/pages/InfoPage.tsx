import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/ui/Commerce';
import { NotFoundPage } from './NotFoundPage';
import { useDocumentTitle } from './useDocumentTitle';

const PAGES: Record<string, { title: string; body: Array<[string, string]> }> = {
  shipping: {
    title: 'Shipping & delivery',
    body: [
      ['Standard shipping', 'Home delivery in 2-4 business days for €4.99. Free on orders over €99 (amount after discounts).'],
      ['Express shipping 24 h', 'Delivery on the next business day for €12.99 for orders confirmed before 14:00 (simulated).'],
      ['Pickup point collection', 'Collect your order at one of our convenience points in 3-5 days for €1.99. Free over €49.'],
      ['Shipping area', 'We only ship to addresses in Spain. All delivery times and carriers are fictional.'],
    ],
  },
  returns: {
    title: 'Returns',
    body: [
      ['Return window', 'You have 14 calendar days from delivery to request a return from “My orders”.'],
      ['Process', 'The request stays as “Return requested” until our team reviews it. Once approved, the order becomes “Returned” and the amount is refunded.'],
      ['Cancellations', 'You can cancel a pending or paid order as long as it is not being prepared. If it was paid, the refund is immediate (simulated).'],
    ],
  },
  payments: {
    title: 'Payment methods',
    body: [
      ['Card', 'Instant payment through a simulator. Only the documented test cards are accepted; never enter real card details.'],
      ['Bank transfer', 'We hold the products for 72 hours. If the transfer does not arrive, the order is cancelled automatically.'],
      ['Security', 'Full card numbers are never stored: only the brand and the last 4 digits.'],
    ],
  },
  warranty: {
    title: 'Warranty',
    body: [['3-year warranty', 'Every product includes a 3-year (fictional) warranty. Product and brand names belong to their respective owners and are used for illustrative purposes only: the store has no relationship with them and the images are generic illustrations.']],
  },
  contact: {
    title: 'Contact',
    body: [
      ['Customer support', 'This is an educational project with no commercial activity: there is no real customer support service.'],
      ['E-mail', 'support@qacommerce.test (a domain reserved for testing that does not receive mail).'],
    ],
  },
  about: {
    title: 'About QA Commerce Lab',
    body: [
      ['What is it?', 'A complete, realistic electronics store built as a System Under Test to practise web and API test automation.'],
      ['Fictional data', 'Products use real model names as a reference, but prices, stock, users, payments and shipping are simulated. You can sign up and buy as many times as you like.'],
      ['For QA engineers', 'It includes a REST API documented with OpenAPI, deterministic data, ready-made scenarios and controlled error simulation in the testing environments.'],
    ],
  },
  terms: {
    title: 'Terms & conditions',
    body: [
      ['Use', 'The site is provided for learning and demonstration purposes only. No real sales or charges take place.'],
      ['Content', 'Data may be reset at any time. Do not enter real personal information.'],
    ],
  },
  privacy: {
    title: 'Privacy',
    body: [['Data', 'Use made-up data. Test accounts and orders may be deleted periodically. Only technical session cookies are used.']],
  },
};

export function InfoPage() {
  const { slug = '' } = useParams();
  const page = PAGES[slug];
  useDocumentTitle(page?.title);
  if (!page) return <NotFoundPage />;
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <Breadcrumbs items={[{ label: 'Information' }, { label: page.title }]} />
      <article className="space-y-8" data-testid="info-page">
        <h1 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{page.title}</h1>
        {page.body.map(([h, p]) => (
          <section key={h}>
            <h2 className="mb-2 text-xl font-semibold tracking-tight">{h}</h2>
            <p className="leading-relaxed text-slate-700">{p}</p>
          </section>
        ))}
        <p className="rounded-3xl bg-slate-50 p-5 text-sm text-slate-500">
          More information: <Link to="/info/shipping" className="font-medium text-slate-950 underline underline-offset-2">shipping</Link> · <Link to="/info/returns" className="font-medium text-slate-950 underline underline-offset-2">returns</Link> · <Link to="/info/payments" className="font-medium text-slate-950 underline underline-offset-2">payments</Link>
        </p>
      </article>
    </div>
  );
}
