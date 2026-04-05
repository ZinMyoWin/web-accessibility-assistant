export type Issue = {
  id: number
  severity: "critical" | "serious" | "moderate" | "minor"
  category: string
  title: string
  selector: string
  pages: string[]
  wcag: string
  level: "A" | "AA" | "AAA"
  impact: string
  fix: string
}

export const MOCK_ISSUES: Issue[] = [
  {
    id: 0,
    severity: "critical",
    category: "Images",
    title: "Missing alt attribute on image",
    selector: "img.hero-banner",
    pages: ["/", "/about", "/services"],
    wcag: "1.1.1",
    level: "A",
    impact:
      "Screen readers skip images entirely \u2014 users with visual impairments receive no information about the content of this image.",
    fix: '<img src="hero.jpg"\n  alt="Team collaborating on a project"\n  width="800" height="450">',
  },
  {
    id: 1,
    severity: "critical",
    category: "Forms",
    title: "Form input has no associated label",
    selector: "input#email",
    pages: ["/contact", "/signup"],
    wcag: "1.3.1",
    level: "A",
    impact:
      "Screen reader users cannot identify what information is required in this field. Voice control users cannot target the field by speaking a visible label.",
    fix: '<label for="email">Email address</label>\n<input id="email" type="email"\n  name="email" autocomplete="email">',
  },
  {
    id: 2,
    severity: "serious",
    category: "Links",
    title: "Link text is empty or non-descriptive",
    selector: "a.cta-btn",
    pages: ["/", "/about", "/blog", "/services"],
    wcag: "2.4.4",
    level: "A",
    impact:
      'Keyboard and screen reader users navigating by links cannot determine the link destination. "Click here" and "Read more" provide zero context out of page flow.',
    fix: '<a href="/services">\n  View all accessibility services\n</a>',
  },
  {
    id: 3,
    severity: "serious",
    category: "Contrast",
    title: "Colour contrast ratio below 4.5:1",
    selector: ".footer-text",
    pages: ["/", "/about", "/contact"],
    wcag: "1.4.3",
    level: "AA",
    impact:
      "Low contrast text is unreadable for users with low vision or colour deficiency. Current ratio estimated at 2.8:1 \u2014 minimum required is 4.5:1 for normal text.",
    fix: '/* Change text from #9CA3AF to #6B7280 */\n.footer-text { color: #4B5563; }',
  },
  {
    id: 4,
    severity: "serious",
    category: "Structure",
    title: "Heading hierarchy skips from h1 to h4",
    selector: "h4.section-title",
    pages: ["/about", "/services"],
    wcag: "1.3.1",
    level: "A",
    impact:
      "Screen reader users rely on heading structure to navigate documents. Skipped heading levels break the logical document outline and confuse navigation.",
    fix: '<!-- Use h2 for direct subheadings of h1 -->\n<h1>About us</h1>\n<h2>Our mission</h2>\n<h3>Core values</h3>',
  },
  {
    id: 5,
    severity: "moderate",
    category: "Landmarks",
    title: "Page has no main landmark region",
    selector: "body",
    pages: ["/", "/about", "/contact", "/services", "/blog"],
    wcag: "1.3.6",
    level: "AAA",
    impact:
      "Screen reader users cannot jump directly to the page main content. Every page load requires navigating past repeated headers and navigation.",
    fix: '<header>...</header>\n<main id="main-content">\n  <!-- primary content here -->\n</main>\n<footer>...</footer>',
  },
  {
    id: 6,
    severity: "moderate",
    category: "Forms",
    title: "Button has no accessible name",
    selector: "button.close",
    pages: ["/contact"],
    wcag: "4.1.2",
    level: "A",
    impact:
      'A button with no accessible name is announced as simply "button" to screen reader users \u2014 they cannot determine its purpose.',
    fix: '<button aria-label="Close dialog"\n  class="close">\n  <svg aria-hidden="true">...</svg>\n</button>',
  },
  {
    id: 7,
    severity: "moderate",
    category: "Structure",
    title: "Page language attribute not declared",
    selector: "html",
    pages: ["/", "/about", "/contact"],
    wcag: "3.1.1",
    level: "A",
    impact:
      "Without a language declaration, screen readers may use the wrong language engine, causing mispronunciation and degraded comprehension for assistive technology users.",
    fix: '<html lang="en">',
  },
  {
    id: 8,
    severity: "minor",
    category: "Structure",
    title: "Duplicate id attribute detected",
    selector: "#nav-logo",
    pages: ["/", "/about"],
    wcag: "4.1.1",
    level: "A",
    impact:
      "Duplicate IDs break label associations, ARIA references, and fragment navigation. Some assistive technologies may only recognise the first occurrence.",
    fix: '<!-- Use unique IDs per page -->\n<a id="nav-logo" href="/">\n<a id="footer-logo" href="/">',
  },
  {
    id: 9,
    severity: "minor",
    category: "Structure",
    title: "Empty heading element present",
    selector: "h2:empty",
    pages: ["/blog"],
    wcag: "1.3.1",
    level: "A",
    impact:
      "Empty headings create phantom navigation stops for screen reader users and pollute the page outline shown in accessibility tools.",
    fix: '<!-- Remove or populate the heading -->\n<h2>Latest articles</h2>',
  },
]
