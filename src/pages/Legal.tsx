import type { ReactNode } from 'react';
import { Link } from '../router';
import { SITE } from '../site';

// Plain-language starting points. Have them reviewed before the site goes live with ads.
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

      <h2>2. Your content and responsible use</h2>
      <p>{n} is made for people who want a clean version of AI-generated video or images that they created, for example without the visible sparkle in a finished edit. It is not a tool for taking marks off other people’s work. You may only process content that you created or that you have the rights and permissions to edit. You agree not to use {n}:</p>
      <ul>
        <li>to remove watermarks, logos or other identifying marks from content that belongs to someone else without their permission;</li>
        <li>to infringe anyone’s copyright, trademark, privacy or other rights;</li>
        <li>to deceive people about the origin of content, including passing off AI-generated content as real footage, or to create fraud, disinformation, harassment or non-consensual intimate imagery;</li>
        <li>in breach of the terms of the service that generated your content, or of any law that applies to you, including rules that require AI-generated content to be labelled.</li>
      </ul>
      <p>{n} removes visible marks only. AI-generated media may still contain invisible watermarks or metadata (for example Google’s SynthID), which {n} does not remove. You are responsible for how you use and publish your content.</p>
      <p>Responsible use in short: process only what you have the right to edit, say that content is AI-generated where a platform or the law asks you to, and never present it as something it is not. Your files stay on your device, so we cannot see what is processed. If you learn that {n} is being misused, tell us on the <Link to="/contact">contact page</Link>; we may limit or block abusive use of the website.</p>

      <h2>3. Free service and advertising</h2>
      <p>{n} is free to use. It may be supported by advertising shown on the pages around the tools, provided by third-party advertising companies. Advertisers never receive your files: the cleaning happens in your browser and the files are not sent anywhere. See our <Link to="/privacy">Privacy Policy</Link> for how advertising uses data and how to control it. We may change, limit or stop any part of the service at any time, and we do not promise that it will always be available.</p>

      <h2>4. Fair use</h2>
      <p>Because the processing happens on your own device, there is no limit on how many files you clean. Automated or abusive use of the website itself, such as scripted ad clicks or attempts to disrupt the service, is not allowed and may be blocked.</p>

      <h2>5. Third-party links and ads</h2>
      <p>The ads and links on {n} lead to sites we do not control. We are not responsible for what those sites offer or do, so please use your own judgement.</p>

      <h2>6. Intellectual property</h2>
      <p>You keep all rights to your content. {n}’s software, design and brand belong to us. Third-party names such as Gemini and Veo are trademarks of their owners and are used only to describe compatibility; {n} is not affiliated with or endorsed by Google.</p>

      <h2>7. Disclaimer</h2>
      <p>{n} is provided “as is” and “as available”, without warranties of any kind, to the extent the law allows. Keep your original files: always check results before publishing them.</p>

      <h2>8. Limitation of liability</h2>
      <p>To the extent the law allows, we are not liable for indirect, incidental or consequential damages, or for lost data, profits or revenue. Because the service is free, our total liability for any claim is limited as far as the law allows.</p>

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
        <li><strong>Advertising data.</strong> When ads are shown, the advertising companies behind them may use cookies, device identifiers and similar technologies, and may collect data such as your IP address, browser and the pages you view, to show and measure ads (see “Advertising” below).</li>
        <li><strong>Messages to us.</strong> If you use the contact form or write to us, we keep the conversation to help you. The form’s name, email address and message are passed on to Web3Forms, the service that delivers them to our inbox; nothing else is sent, and it is only sent when you press “Send message”.</li>
      </ul>
      <p>We have no accounts and ask for no personal details to use the tools.</p>

      <h2>How we use it</h2>
      <p>To run and secure the service, show and measure advertising, answer support requests and meet legal obligations. We do not sell your personal data. Your videos and photos are never used for advertising, because they never leave your device.</p>

      <h2>Advertising</h2>
      <p>{n} is free and supported by advertising from third-party advertising companies. Right now no ads are shown. When we show ads, they appear beside and between the pages’ text, and each ad runs in its own sandboxed frame, so it cannot reach the page or the files you are working on. Ad code can use cookies and similar technologies and receives technical data such as your IP address and browser. It never receives the videos or photos you clean, which never leave your device. Advertising companies are responsible for the data they collect; they have their own privacy policies, which you can read from their ads.</p>
      <ul>
        <li>Where visitors have to be asked first (for example in the EEA, the UK and Switzerland), ads that use cookies or personal data are only shown after you say yes. You can change your answer at any time with “Ad choices” in the footer. If you say no, the website works the same, without ads.</li>
        <li>You can also block ads and cookies in your browser; the tools keep working without them.</li>
        <li>Ads are kept away from the tools themselves. Nothing you add to a tool is shared with advertisers.</li>
      </ul>

      <h2>Cookies</h2>
      <p>We use only the cookies and local storage needed to run the website. Advertising cookies are set by the advertising companies, subject to your consent where the law requires it. You can also block or delete cookies in your browser settings; the tools keep working without them.</p>

      <h2>Sharing</h2>
      <p>We share data only with providers that help us run {n} (hosting and advertising companies), under agreements that protect it, or when the law requires.</p>

      <h2>Retention</h2>
      <p>We keep support emails for as long as needed to help you and meet legal obligations. Advertising data is kept by the advertising companies under their own policies.</p>

      <h2>Your rights</h2>
      <p>Depending on where you live (for example under the GDPR or the CCPA), you can ask to access, correct, delete or export the data we hold about you, and object to or restrict its use. Write to <Mail /> and we will reply within 30 days. You can also complain to your local data protection authority.</p>

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
