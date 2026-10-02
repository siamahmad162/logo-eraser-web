import type { ReactNode } from 'react';
import { Link } from '../router';
import { SITE } from '../site';

// Plain-language starting points. Have them reviewed before taking payments.
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <section className="page-head">
        <div className="wrap narrow">
          <h1>{title}</h1>
          <p className="lede">Last updated {SITE.legalUpdated}</p>
        </div>
      </section>
      <section className="section section-tight">
        <div className="wrap narrow prose">{children}</div>
      </section>
    </>
  );
}

const Mail = () => <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>;

export function Terms() {
  const n = SITE.name;
  return (
    <LegalPage title="Terms of Service">
      <p>These terms govern your use of {n} (“{n}”, “we”, “us”), operated by {SITE.operator}. By using the website or the watermark remover you agree to them. If you don’t agree, please don’t use {n}.</p>

      <h2>1. The service</h2>
      <p>{n} is a browser-based tool that removes visible logos and watermarks from videos and images. Processing happens on your own device: your files are not uploaded to us. Results depend on your files, browser and device, and we can’t guarantee a perfect result for every file.</p>

      <h2>2. Your content and acceptable use</h2>
      <p>You may only process content that you created or that you have the rights and permissions to edit. You agree not to use {n}:</p>
      <ul>
        <li>to remove watermarks, logos or other identifying marks from content that belongs to someone else without their permission;</li>
        <li>to infringe anyone’s copyright, trademark, privacy or other rights;</li>
        <li>to deceive people about the origin of content, including passing off AI-generated content as real footage, or to create fraud, disinformation, harassment or non-consensual intimate imagery;</li>
        <li>in breach of the terms of the service that generated your content, or of any law that applies to you, including rules that require AI-generated content to be labelled.</li>
      </ul>
      <p>{n} removes visible marks only. AI-generated media may still contain invisible watermarks or metadata (for example Google’s SynthID), which {n} does not remove. You are responsible for how you use and publish your content.</p>

      <h2>3. Accounts</h2>
      <p>Some features may require an account. Keep your sign-in details secure; you are responsible for activity under your account. We may suspend accounts that break these terms.</p>

      <h2>4. Subscriptions and payments</h2>
      <p>Paid plans are billed in advance, monthly or yearly, and renew automatically until cancelled. Payments are handled by our payment partner, who acts as the merchant of record and may add applicable taxes. You can cancel at any time; your plan stays active until the end of the paid period. Refunds are covered by our <Link to="/refunds">Refund Policy</Link>. We may change prices with reasonable advance notice; changes apply from your next billing period.</p>

      <h2>5. Fair use</h2>
      <p>“Unlimited” plans are for normal individual or team use. Automated or abusive use that degrades the service for others may be limited.</p>

      <h2>6. Intellectual property</h2>
      <p>You keep all rights to your content. {n}’s software, design and brand belong to us. Third-party names such as Gemini and Veo are trademarks of their owners and are used only to describe compatibility; {n} is not affiliated with or endorsed by Google.</p>

      <h2>7. Disclaimer</h2>
      <p>{n} is provided “as is” and “as available”, without warranties of any kind, to the extent the law allows. Keep your original files: always check results before publishing them.</p>

      <h2>8. Limitation of liability</h2>
      <p>To the extent the law allows, we are not liable for indirect, incidental or consequential damages, or for lost data, profits or revenue. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim.</p>

      <h2>9. Indemnity</h2>
      <p>You agree to cover claims, losses and costs arising from content you process or publish with {n} in breach of these terms or the law.</p>

      <h2>10. Changes and termination</h2>
      <p>We may update these terms; if a change is significant we will give notice on the website or by email. You may stop using {n} at any time. We may suspend or end access for breaches of these terms.</p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of {SITE.country}, without affecting any mandatory consumer protections you have where you live.</p>

      <h2>12. Contact</h2>
      <p>Questions about these terms: <Mail />.</p>
    </LegalPage>
  );
}

export function Privacy() {
  const n = SITE.name;
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what data {n}, operated by {SITE.operator}, collects and why. The short version: your videos and photos are processed on your device and never sent to us.</p>

      <h2>Your files</h2>
      <p>The watermark remover runs entirely in your browser. The files you add, the previews and the results stay on your device. We do not receive, store or see them.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Website logs.</strong> Our hosting provider processes technical data such as IP address, browser type and pages requested, to deliver and protect the website.</li>
        <li><strong>Account data</strong> (when accounts are available). If you sign in, we store your email address, name and sign-in provider, and your plan and usage counts so limits can be applied.</li>
        <li><strong>Payment data</strong> (when you subscribe). Payments are handled by our payment partner, the merchant of record. We receive your subscription status, country and the last digits of your card; we never see your full card details.</li>
        <li><strong>Support emails.</strong> If you write to us, we keep the conversation to help you.</li>
      </ul>

      <h2>How we use it</h2>
      <p>To run and secure the service, manage accounts and subscriptions, answer support requests and meet legal obligations. We do not sell your personal data and do not use it for advertising.</p>

      <h2>Cookies</h2>
      <p>We use only the cookies and local storage needed to run the website and keep you signed in. If we ever add analytics or marketing cookies, we will ask for your consent where the law requires it.</p>

      <h2>Sharing</h2>
      <p>We share data only with providers that help us run {n} (hosting, authentication, database, payments, email), under agreements that protect it, or when the law requires.</p>

      <h2>Retention</h2>
      <p>Account data is kept while your account is open and deleted within 30 days of you asking us to delete it, except where we must keep records (for example invoices) by law.</p>

      <h2>Your rights</h2>
      <p>Depending on where you live (for example under the GDPR or the CCPA), you can ask to access, correct, delete or export your data, and object to or restrict its use. Write to <Mail /> and we will reply within 30 days. You can also complain to your local data protection authority.</p>

      <h2>International transfers</h2>
      <p>Our providers may process data in other countries. Where required, transfers are protected by appropriate safeguards such as standard contractual clauses.</p>

      <h2>Children</h2>
      <p>{n} is not intended for children under 16, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>We will post updates here and change the date above. Significant changes will be announced on the website or by email.</p>

      <h2>Contact</h2>
      <p><Mail /></p>
    </LegalPage>
  );
}

export function Refunds() {
  const n = SITE.name;
  return (
    <LegalPage title="Refund Policy">
      <p>We want you to be happy with {n} Pro. Since you can try the free plan first, we keep refunds simple.</p>

      <h2>14-day money-back guarantee</h2>
      <p>If {n} Pro doesn’t work for you, ask within 14 days of your first payment and we will refund it in full. No lengthy questions; a short note on what went wrong helps us improve.</p>

      <h2>Renewals</h2>
      <p>Renewal payments are generally not refunded, but if you forgot to cancel and haven’t used Pro since the renewal, write to us within 7 days and we will usually refund it.</p>

      <h2>Cancelling</h2>
      <p>You can cancel at any time. Your plan stays active until the end of the period you paid for and will not renew.</p>

      <h2>Your legal rights</h2>
      <p>Nothing in this policy limits rights you have under consumer law where you live, such as the 14-day withdrawal right for consumers in the EU and UK.</p>

      <h2>How to ask</h2>
      <p>Email <Mail /> from the address you used to subscribe, or reply to your receipt. Refunds go back to the original payment method, usually within 5–10 business days.</p>
    </LegalPage>
  );
}
