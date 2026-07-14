const mongoose = require('mongoose');

const PricingRowSchema = new mongoose.Schema(
  { service: { type: String, trim: true }, price: { type: String, trim: true } },
  { _id: false }
);

const PricingBlockSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    subtitle: { type: String, default: '' },
    rows: { type: [PricingRowSchema], default: [] },
    ctaText: { type: String, default: 'Get Started' },
    ctaUrl: { type: String, default: '#' },
  },
  { _id: false }
);

const ServiceCardSchema = new mongoose.Schema(
  {
    icon: { type: String, trim: true, default: '' },
    title: { type: String, trim: true },
    description: { type: String, default: '' },
    features: { type: [String], default: [] },
    linkText: { type: String, default: 'Learn More' },
    linkUrl: { type: String, default: '#' },
  },
  { _id: false }
);

const TestimonialSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    role: { type: String, trim: true, default: '' },
    quote: { type: String, trim: true },
  },
  { _id: false }
);

// A generic icon+title+description card, reused for "How It Works" steps
// and "What We Build" items so both sections share one editor shape.
const IconCardSchema = new mongoose.Schema(
  {
    icon: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    desc: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

// One document per page (e.g. "index"). Every top-level section is optional —
// the frontend falls back to its own hardcoded default for any section this
// document doesn't have data for yet, so a half-filled-in page never breaks.
const SiteContentSchema = new mongoose.Schema(
  {
    page: { type: String, required: true, unique: true, lowercase: true, trim: true },
    hero: {
      title: { type: String, default: '' },
      subtitle: { type: String, default: '' },
    },
    contact: {
      whatsappNumber: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    pricing: { type: [PricingBlockSchema], default: [] },
    services: { type: [ServiceCardSchema], default: [] },
    testimonials: { type: [TestimonialSchema], default: [] },
    testimonialDisclaimer: { type: String, default: '' },
    founder: {
      name: { type: String, default: '' },
      bio: { type: String, default: '' },
    },
    howItWorks: {
      title: { type: String, default: '' },
      subtitle: { type: String, default: '' },
      steps: { type: [IconCardSchema], default: [] },
    },
    whatWeBuild: {
      title: { type: String, default: '' },
      items: { type: [IconCardSchema], default: [] },
    },
    growthPlan: {
      title: { type: String, default: '' },
      text: { type: String, default: '' },
      buttonText: { type: String, default: '' },
    },
    newsletterText: { type: String, default: '' },
    cta: {
      heading: { type: String, default: '' },
      subtitle: { type: String, default: '' },
      note: { type: String, default: '' },
    },
    footer: {
      brandDesc: { type: String, default: '' },
      copyrightText: { type: String, default: '' },
    },
    demosIntro: {
      label: { type: String, default: '' },
      title: { type: String, default: '' },
      subtitle: { type: String, default: '' },
    },
    solutionsIntro: {
      label: { type: String, default: '' },
      title: { type: String, default: '' },
      subtitle: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.SiteContent || mongoose.model('SiteContent', SiteContentSchema);
