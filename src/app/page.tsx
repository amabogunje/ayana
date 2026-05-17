import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarCheck, CircleDollarSign, Headphones, MessageSquareText, PhoneCall, Send } from "lucide-react";
import { PilotLeadDialog } from "@/components/pilot-lead-dialog";
import { ScrollAnchorLink } from "@/components/scroll-anchor-link";

const steps = [
  {
    icon: PhoneCall,
    title: "Customers message anytime",
    description: "Calls, texts, and DMs come in before, during, and after service",
  },
  {
    icon: MessageSquareText,
    title: "Ayana qualifies them",
    description: "Every inquiry gets an instant reply and the right booking questions",
  },
  {
    icon: CircleDollarSign,
    title: "Deposit links are sent",
    description: "Ayana shares pricing, available options, and a deposit link",
  },
  {
    icon: CalendarCheck,
    title: "Bookings confirm automatically",
    description: "Paid reservations are confirmed and shared with your team",
  },
];

const changes = [
  "More confirmed bookings",
  "Fill empty tables that go unsold",
  "Reduce last-minute vacancy",
];

const constants = [
  "No extra staff needed",
  "No workflow changes",
  "No operational disruption",
];

const pilotSteps = [
  {
    icon: Headphones,
    title: "Capture Every Inquiry",
    description: "Capture all inbound inquiries across calls, texts, and messages in real time",
  },
  {
    icon: Send,
    title: "Track Bookings and Revenue",
    description: "See how many bookings are confirmed and how much revenue is captured",
  },
  {
    icon: BadgeCheck,
    title: "Decide Based on Results",
    description: "Keep using Ayana once it proves its value for your business",
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav" aria-label="Landing navigation">
        <Link href="/" className="ayana-wordmark">
          ayana
        </Link>

        <nav className="landing-nav-links" aria-label="Primary">
          <a href="#how-it-works">How it works</a>
          <a href="#pilot">Try Ayana!</a>
          <Link href="/operator/login" className="landing-nav-cta">
            Login
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <h1>Turn missed messages into bookings</h1>
            <p>
              Customers message you before you open. If you don&apos;t respond instantly, they book
              somewhere else. Ayana replies in seconds, secures deposits, and confirms bookings for
              you.
            </p>
            <div className="landing-actions">
              <ScrollAnchorLink targetId="pilot" className="landing-button landing-button-primary">
                Get Started
                <ArrowRight size={18} />
              </ScrollAnchorLink>
            </div>
            <p className="landing-hero-punchline">Venues using Ayana capture up to 30% more bookings</p>
          </div>

          <aside className="landing-product-ui" aria-label="Ayana operator dashboard preview">
            <Image
              src="/landing/operator-dashboard-overview-v4.png"
              alt="Ayana operator overview dashboard showing bookings, deposits, events, and inbox activity"
              width={1194}
              height={1099}
              priority
              sizes="(max-width: 760px) calc(100vw - 32px), 560px"
              className="landing-dashboard-shot"
            />
          </aside>
        </div>
      </section>

      <section id="how-it-works" className="landing-section landing-how">
        <div className="landing-container">
          <div className="landing-how-showcase">
            <div className="landing-iphone-frame" aria-label="Example WhatsApp reservation conversation">
              <span className="landing-iphone-speaker" />
              <div className="landing-whatsapp-phone">
                <div className="landing-whatsapp-header">
                  <span>VR</span>
                  <div>
                    <strong>Velvet Room</strong>
                    <small>online</small>
                  </div>
                </div>

                <div className="landing-whatsapp-thread">
                  <p className="landing-whatsapp-bubble landing-whatsapp-outbound">
                    Hi, this is Velvet Room. How many guests are you planning for?
                  </p>
                  <p className="landing-whatsapp-bubble landing-whatsapp-inbound">
                    Do you have a table for 6 this Friday around 11?
                  </p>
                  <p className="landing-whatsapp-bubble landing-whatsapp-outbound">
                    Yes. A lounge table is available with a $900 minimum and $150 deposit.
                  </p>
                  <p className="landing-whatsapp-bubble landing-whatsapp-outbound">
                    The table includes priority entry and seating until 2AM.
                  </p>
                  <p className="landing-whatsapp-bubble landing-whatsapp-inbound">
                    Is the $900 minimum okay if we arrive closer to 11:30?
                  </p>
                  <p className="landing-whatsapp-bubble landing-whatsapp-outbound">
                    Yes. We can hold it for 11:30 with the deposit.
                  </p>
                  <p className="landing-whatsapp-bubble landing-whatsapp-inbound">
                    That works. Can I book it?
                  </p>
                  <p className="landing-whatsapp-bubble landing-whatsapp-outbound">
                    Absolutely. Use this secure link to pay the deposit and confirm your table.
                  </p>
                  <div className="landing-whatsapp-link">
                    <span>Secure deposit</span>
                    <strong>$150 payment link</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="landing-how-workflow">
              <h2>How It Works</h2>

              <div className="landing-step-grid">
                {steps.map((step) => {
                  const Icon = step.icon;

                  return (
                    <article key={step.title} className="landing-step">
                      <span className="landing-step-icon">
                        <Icon size={48} strokeWidth={1.7} />
                      </span>
                      <div>
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                      </div>
                    </article>
                  );
                })}
              </div>

              <p className="landing-bottom-line">Runs alongside your existing operation &mdash; no changes required</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-owner-section">
        <div className="landing-container">
          <div className="landing-owner-content">
            <div className="landing-owner-copy">
              <h2>Built for owners who want to capture every booking opportunity</h2>
              <p>
                Most inquiries happen when you&apos;re not available to respond. Ayana makes sure you
                never lose them.
              </p>
            </div>

            <div className="landing-impact-grid">
              <article className="landing-impact-panel">
                <h2>What changes</h2>
                <ul>
                  {changes.map((item) => (
                    <li key={item}>
                      <BadgeCheck size={18} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="landing-impact-panel">
                <h2>What doesn&apos;t</h2>
                <ul>
                  {constants.map((item) => (
                    <li key={item}>
                      <BadgeCheck size={18} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section id="pilot" className="landing-section landing-pilot">
        <div className="landing-container landing-centered">
          <h2>Try Ayana for 30 days</h2>

          <div className="landing-pilot-grid">
            {pilotSteps.map((step) => (
              <article key={step.title} className="landing-pilot-step">
                <span>
                  <step.icon size={28} />
                </span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>

          <PilotLeadDialog />
          <p>No upfront cost &mdash; only pay for confirmed bookings</p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <div>
            <strong className="ayana-wordmark">ayana</strong>
            <span>&copy; 2026</span>
          </div>
          <a href="https://getayana.com">getayana.com</a>
        </div>
      </footer>
    </main>
  );
}

