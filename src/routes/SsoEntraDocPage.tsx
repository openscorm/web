import type { ReactNode } from "react";

import { LobbyLayout } from "@/components/LobbyLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

// Public help page: setting up SAML single sign-on with Microsoft Entra ID.
// Written for a customer's IT department, so it is reachable without signing
// in and, like /trust, not linked from any chrome yet.
//
// The URLs are written against app.openscorm.com rather than the origin the
// page is served from. They are the values a customer registers in Entra, and
// the API composes them from its configured EntityIdBase, which is the app
// origin in production; on test this page still shows what a customer needs.
// SsoEntraDocPage.test.tsx pins them to the shape SamlServiceProviderIdentity
// composes, so a route change that would break every customer's application
// also breaks the test.

export const SSO_DOC_LAST_UPDATED = "2026-10-09";

const SAML_BASE = "https://app.openscorm.com/api/auth/saml/<handle>";

export const SSO_URLS = {
  metadata: `${SAML_BASE}/metadata`,
  identifier: SAML_BASE,
  replyUrl: `${SAML_BASE}/acs`,
  signOnUrl: `${SAML_BASE}/login`,
} as const;

const SUPPORT_EMAIL = "support@openscorm.com";

export function SsoEntraDocPage() {
  usePageTitle("Set up single sign-on with Microsoft Entra ID | OpenSCORM");

  return (
    <LobbyLayout>
      <article className="w-full max-w-3xl text-sm leading-relaxed">
        <p className="text-muted-foreground font-medium">Docs</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Set up single sign-on with Microsoft Entra ID
        </h1>
        <p className="text-muted-foreground mt-3">
          Last updated <span className="font-mono">{SSO_DOC_LAST_UPDATED}</span>
        </p>

        <p className="mt-6">
          This guide connects your Microsoft Entra ID tenant to OpenSCORM over SAML 2.0, so your
          people sign in to OpenSCORM with their work account. An Entra administrator can usually
          finish it in 15 to 20 minutes, plus one exchange of values with OpenSCORM.
        </p>

        <div className="mt-8 space-y-10">
          <Section id="before" heading="Before you start">
            <p>You need two things:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>An Entra role that can create enterprise applications.</strong> Cloud
                Application Administrator, Application Administrator or Global Administrator all
                work.
              </li>
              <li>
                <strong>Your OpenSCORM organization handle.</strong> OpenSCORM sends it to you. It
                is the short name in your organization's OpenSCORM address, for example{" "}
                <Code>contoso</Code>. Wherever this guide shows <Code>{"<handle>"}</Code>, type your
                handle in its place.
              </li>
            </ul>
            <p>Your OpenSCORM service provider values are:</p>
            <ValueTable
              columns={["Setting", "Value"]}
              rows={[
                ["Metadata URL", <Code key="m">{SSO_URLS.metadata}</Code>],
                ["Identifier (Entity ID)", <Code key="i">{SSO_URLS.identifier}</Code>],
                [
                  "Reply URL (Assertion Consumer Service URL)",
                  <Code key="r">{SSO_URLS.replyUrl}</Code>,
                ],
                ["Sign on URL", <Code key="s">{SSO_URLS.signOnUrl}</Code>],
              ]}
            />
            <p>
              Open the metadata URL in a browser to check your handle. It shows a short XML document
              whose <Code>entityID</Code> matches the Identifier above. If it shows "Single sign-on
              is not available" instead, the handle is wrong.
            </p>
          </Section>

          <Section id="step-1" heading="Step 1: Create the enterprise application">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Sign in to the{" "}
                <ExternalLink href="https://portal.azure.com">Azure portal</ExternalLink> or the{" "}
                <ExternalLink href="https://entra.microsoft.com">
                  Microsoft Entra admin center
                </ExternalLink>
                .
              </li>
              <li>
                Open <strong>Enterprise applications</strong>. The quickest way is to type
                "Enterprise applications" in the search bar at the top of the page.
              </li>
              <li>
                On <strong>All applications</strong>, select <strong>New application</strong>.
              </li>
              <li>
                Select <strong>Create your own application</strong>.
              </li>
              <li>
                Name it <Code>OpenSCORM</Code>, choose{" "}
                <strong>
                  Integrate any other application you don't find in the gallery (Non-gallery)
                </strong>
                , and select <strong>Create</strong>.
              </li>
              <li>
                When the application opens, select <strong>Single sign-on</strong> in the left menu,
                then select <strong>SAML</strong>.
              </li>
            </ol>
          </Section>

          <Section id="step-2" heading="Step 2: Basic SAML configuration">
            <p>The quickest way is to import OpenSCORM's metadata:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Save <Code>{SSO_URLS.metadata}</Code> to a file named{" "}
                <Code>openscorm-metadata.xml</Code>.
              </li>
              <li>
                At the top of the <strong>Set up Single Sign-On with SAML</strong> page, select{" "}
                <strong>Upload metadata file</strong>, choose the file, and select{" "}
                <strong>Add</strong>.
              </li>
              <li>
                In the panel that opens, set <strong>Sign on URL</strong> to{" "}
                <Code>{SSO_URLS.signOnUrl}</Code>, then select <strong>Save</strong>.
              </li>
            </ol>
            <p>
              To enter the values by hand instead, select <strong>Edit</strong> on{" "}
              <strong>Basic SAML Configuration</strong> and fill in:
            </p>
            <ValueTable
              columns={["Field", "Value"]}
              rows={[
                ["Identifier (Entity ID)", <Code key="i">{SSO_URLS.identifier}</Code>],
                [
                  "Reply URL (Assertion Consumer Service URL)",
                  <Code key="r">{SSO_URLS.replyUrl}</Code>,
                ],
                ["Sign on URL", <Code key="s">{SSO_URLS.signOnUrl}</Code>],
                ["Relay State", "Leave blank"],
                ["Logout Url", "Leave blank"],
              ]}
            />
            <p>
              Delete any other Identifier or Reply URL rows, and make sure the OpenSCORM values are
              marked <strong>Default</strong>. Every letter matters, so copy the values rather than
              retyping them.
            </p>
            <p>
              The Sign on URL is what makes the OpenSCORM tile in My Apps start a normal sign-in.
            </p>
          </Section>

          <Section id="step-3" heading="Step 3: Attributes and claims">
            <p>
              OpenSCORM identifies every person by email address. It reads the{" "}
              <Code>emailaddress</Code> claim, and falls back to the Unique User Identifier (Name
              ID) only when that claim is missing. Entra's defaults already send what OpenSCORM
              needs, so this step is a check rather than a change.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                On the SAML page, look at the <strong>Attributes &amp; Claims</strong> card.
              </li>
              <li>
                Check that <Code>emailaddress</Code> comes from <Code>user.mail</Code>, which is the
                default.
              </li>
              <li>
                Leave <Code>givenname</Code> and <Code>surname</Code> in place. OpenSCORM uses them
                as the person's display name.
              </li>
            </ol>
            <p>
              A user with no <Code>mail</Code> value reaches OpenSCORM under the Name ID instead,
              which by default is their user principal name (UPN). Make sure every user you assign
              in step 4 has a <Code>mail</Code> value, or a UPN that is their real email address.
            </p>
            <p>Also check two security settings:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Token signing certificate.</strong> Under <strong>Edit</strong> on the{" "}
                <strong>SAML Certificates</strong> card, leave <strong>Signing Option</strong> at{" "}
                <strong>Sign SAML assertion</strong> and <strong>Signing Algorithm</strong> at{" "}
                <strong>SHA-256</strong>, which are the defaults. OpenSCORM requires a signed
                assertion.
              </li>
              <li>
                <strong>Token encryption.</strong> Leave it off (<strong>Security</strong> &gt;{" "}
                <strong>Token encryption</strong> in the application's left menu). OpenSCORM does
                not accept encrypted assertions.
              </li>
            </ul>
          </Section>

          <Section id="step-4" heading="Step 4: Assign users and groups">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In the application's left menu, select <strong>Users and groups</strong>, then{" "}
                <strong>Add user/group</strong>.
              </li>
              <li>
                Choose the users or groups who should reach OpenSCORM, and select{" "}
                <strong>Assign</strong>.
              </li>
            </ol>
            <p>
              Entra refuses sign-in to anyone who is not assigned, as long as{" "}
              <strong>Properties</strong> &gt; <strong>Assignment required?</strong> is{" "}
              <strong>Yes</strong>, which is the default. Leave it on, so that only the people you
              choose can sign in.
            </p>
          </Section>

          <Section id="step-5" heading="Step 5: Send these values to OpenSCORM">
            <p>
              The first three come from the <strong>SAML Certificates</strong> and{" "}
              <strong>Set up OpenSCORM</strong> cards on the SAML page. Email them to your OpenSCORM
              contact. None of them is a secret.
            </p>
            <ValueTable
              columns={["What to send", "Where to find it", "Typical form"]}
              rows={[
                [
                  "Microsoft Entra Identifier",
                  "Set up OpenSCORM card",
                  <Code key="e">{"https://sts.windows.net/<your-tenant-id>/"}</Code>,
                ],
                [
                  "Login URL",
                  "Set up OpenSCORM card",
                  <Code key="l">{"https://login.microsoftonline.com/<your-tenant-id>/saml2"}</Code>,
                ],
                ["Certificate (Base64)", "SAML Certificates card, Download", "A .cer file"],
                [
                  "Email domains",
                  "Your own list",
                  <span key="d">
                    <Code>contoso.com</Code>, <Code>contoso.ca</Code>
                  </span>,
                ],
                ["Create accounts automatically?", "Your decision", "Yes (the default) or No"],
              ]}
            />
            <p>
              The email domains are the part after the @ in your people's addresses. When someone
              types an address at one of these domains on the OpenSCORM sign-in page, they are
              offered your single sign-on. A domain can belong to only one OpenSCORM organization.
            </p>
            <p>
              OpenSCORM saves your settings, checks them, and tells you when single sign-on is on.
            </p>
          </Section>

          <Section id="step-6" heading="Step 6: Test sign-in">
            <p>
              Wait until OpenSCORM confirms that single sign-on is on, then test with a user you
              assigned in step 4:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In a private browser window, go to <Code>https://app.openscorm.com/login</Code>.
              </li>
              <li>
                Type the user's work email address. The page shows{" "}
                <strong>Your organization uses single sign-on</strong>.
              </li>
              <li>
                Select <strong>Continue with single sign-on</strong> and complete the Microsoft
                sign-in.
              </li>
              <li>The user lands in OpenSCORM, signed in.</li>
            </ol>
            <p>
              The OpenSCORM tile in{" "}
              <ExternalLink href="https://myapps.microsoft.com">My Apps</ExternalLink> and the{" "}
              <strong>Test</strong> button on Entra's SAML page should give the same result. If
              anything else happens, see{" "}
              <a href="#troubleshooting" className="underline underline-offset-2">
                Troubleshooting
              </a>{" "}
              below.
            </p>
          </Section>

          <Section id="behavior" heading="How sign-in behaves">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>First sign-in creates the account.</strong> It uses the person's email and
                name from Entra, unless you asked OpenSCORM not to create accounts automatically. In
                that case, people must be invited in OpenSCORM first.
              </li>
              <li>
                <strong>Existing accounts are matched by email.</strong> People who already use
                OpenSCORM keep their account and history.
              </li>
              <li>
                <strong>Your plan's user limit still applies.</strong> A new person who would go
                over it is refused until an administrator adds capacity.
              </li>
              <li>
                <strong>Entra controls sign-in strength.</strong> OpenSCORM does not add its own
                verification step to a single sign-on, so your Conditional Access and MFA policies
                are what protect it.
              </li>
              <li>
                <strong>Password sign-in still works.</strong> Single sign-on is added alongside
                passwords. It does not replace them.
              </li>
              <li>
                <strong>Removing someone in Entra does not deactivate them in OpenSCORM.</strong> It
                stops new single sign-on sign-ins. To remove access completely, also deactivate the
                person in OpenSCORM.
              </li>
            </ul>
          </Section>

          <Section id="certificate-renewal" heading="Signing certificate renewal">
            <p>
              Entra's SAML signing certificate expires, three years after creation by default, and
              Entra emails the notification address on the <strong>SAML Certificates</strong> card
              beforehand. OpenSCORM can trust the old and new certificates at the same time, so
              renewal needs no downtime:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                On <strong>SAML Certificates</strong>, select <strong>Edit</strong>, then{" "}
                <strong>New Certificate</strong>, and save it <strong>without</strong> making it
                active.
              </li>
              <li>
                Download the new <strong>Certificate (Base64)</strong> and send it to OpenSCORM.
              </li>
              <li>
                When OpenSCORM confirms it has been added, make the new certificate active in Entra.
              </li>
              <li>Tell OpenSCORM, so it can retire the old one.</li>
            </ol>
          </Section>

          <Section id="troubleshooting" heading="Troubleshooting">
            <ValueTable
              columns={["What you see", "Cause", "Fix"]}
              rows={[
                [
                  "Microsoft error AADSTS700016 (application not found)",
                  "The Identifier in Entra does not match OpenSCORM's",
                  "Copy the Identifier from step 2 again, including /api/ and your handle",
                ],
                [
                  "Microsoft error AADSTS50011 (reply URL does not match)",
                  "The Reply URL in Entra does not match OpenSCORM's",
                  "Copy the Reply URL from step 2 again, and mark it Default",
                ],
                [
                  "Microsoft error AADSTS50105 (user not assigned)",
                  "The person is not assigned to the application",
                  "Assign them or their group (step 4)",
                ],
                [
                  'OpenSCORM: "Single sign-on is not available"',
                  "Single sign-on is not on yet, or the handle in the address is wrong",
                  "Check with OpenSCORM, and check the handle",
                ],
                [
                  'OpenSCORM: "Authentication failed"',
                  "OpenSCORM could not verify the sign-in: a different or renewed certificate, token encryption on, or the wrong signing option",
                  "Send OpenSCORM the active Certificate (Base64), and check step 3",
                ],
                [
                  'OpenSCORM: "Sign-in is missing an email address"',
                  "The emailaddress claim and the Name ID are both empty for this user",
                  "Check the emailaddress claim as in step 3, and make sure the user has a mail value",
                ],
                [
                  'OpenSCORM: "No account for this sign-in"',
                  "Automatic account creation is off, and this person was not invited",
                  "Invite them in OpenSCORM, or ask OpenSCORM to turn automatic creation on",
                ],
                [
                  'OpenSCORM: "Organization is at its user limit"',
                  "Your plan's user limit is reached",
                  "An OpenSCORM administrator adds capacity",
                ],
                [
                  "No Continue with single sign-on prompt on the sign-in page",
                  "The email domain is not registered, or single sign-on is not on yet",
                  "Send OpenSCORM the domain (step 5)",
                ],
              ]}
            />
            <p>
              For anything else, email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-mono underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              with the time of the attempt and the user's email address.
            </p>
          </Section>
        </div>
      </article>
    </LobbyLayout>
  );
}

function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {heading}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

// Machine values a reader copies into a console. break-all because the
// SAML URLs are longer than a phone is wide and carry no natural break point.
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs break-all">{children}</code>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  );
}

function ValueTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            {columns.map((column) => (
              <th key={column} className="py-2 pr-4 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-border border-b align-top last:border-0">
              {row.map((cell, c) => (
                <td key={c} className={c === 0 ? "py-2 pr-4 font-medium" : "py-2 pr-4"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
