import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarCheck, CircleDollarSign, Headphones, MessageSquareText, PhoneCall, Send } from "lucide-react";
import { PilotLeadDialog } from "@/components/pilot-lead-dialog";
import { ScrollAnchorLink } from "@/components/scroll-anchor-link";

const steps = [
  {
    icon: PhoneCall,
    title: "Customers reach out",
    description: "Calls, texts, and messages come in throughout the day and night",
  },
  {
    icon: MessageSquareText,
    title: "Ayana responds instantly",
    description: "Every inquiry gets an immediate reply - even when your team is unavailable",
  },
  {
    icon: CircleDollarSign,
    title: "Options are provided",
    description: "Customers are shown available tables and can confirm with a deposit",
  },
  {
    icon: CalendarCheck,
    title: "Bookings are confirmed",
    description: "Reservations are logged and shared with your team automatically",
  },
];

const changes = [
  "More confirmed bookings",
  "Increase table utilization",
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
            <h1>Turn every customer inquiry into a booking</h1>
            <p className="landing-hero-support">
              Most venues already get demand, they just don&apos;t respond fast enough to capture it.
            </p>
            <p>
              Ayana handles every call, text, and DM instantly, so you never lose a customer due to
              slow response or unavailability.
            </p>
            <div className="landing-actions">
              <ScrollAnchorLink targetId="pilot" className="landing-button landing-button-primary">
                Get Started
                <ArrowRight size={18} />
              </ScrollAnchorLink>
            </div>
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
          <h2>How It Works</h2>

          <div className="landing-step-grid">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <article key={step.title} className="landing-step">
                  <span className="landing-step-icon">
                    <Icon size={48} strokeWidth={1.7} />
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              );
            })}
          </div>

          <p className="landing-bottom-line">Runs alongside your existing operation &mdash; no changes required</p>
        </div>
      </section>

      <section className="landing-section landing-owner-section">
        <div className="landing-container">
          <div className="landing-owner-content">
            <div className="landing-owner-copy">
              <h2>Built for owners who want to capture every booking opportunity</h2>
              <p>
                Ayana gives your team a reliable way to handle every incoming inquiry, responding
                instantly while you stay in control of availability, pricing, and final booking decisions.
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

