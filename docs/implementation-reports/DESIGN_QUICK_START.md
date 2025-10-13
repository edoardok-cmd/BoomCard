# BoomCard Design - Quick Start Guide

## 🚀 Getting Started

### Installation & Setup
```bash
cd partner-dashboard
npm install
npm run dev
```

Visit: `http://localhost:3001`

---

## 🎨 Using the Design System

### Buttons
```tsx
import Button from '../components/common/Button/Button';

// Primary (Black)
<Button variant="primary" size="large">Get Started</Button>

// Secondary (White with border)
<Button variant="secondary" size="medium">Learn More</Button>

// Ghost (Transparent)
<Button variant="ghost" size="small">Cancel</Button>

// Danger (Red)
<Button variant="danger">Delete</Button>
```

### Cards
```tsx
import Card from '../components/common/Card/Card';

<Card>
  <h3>Title</h3>
  <p>Content goes here</p>
</Card>
```

### Loading States
```tsx
import Loading from '../components/common/Loading/Loading';

// Inline
<Loading size="medium" />

// Full screen
<Loading size="large" fullScreen />
```

### Skeleton Screens
```tsx
import { Skeleton, SkeletonText, SkeletonCard } from '../components/common/Skeleton/Skeleton';

// Custom skeleton
<Skeleton height="200px" width="100%" />

// Text skeleton
<SkeletonText lines={3} />

// Card skeleton
<SkeletonCard />
```

### Animations
```tsx
import { motion } from 'framer-motion';

// Fade in
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.5 }}
>
  Content
</motion.div>

// Slide up
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
>
  Content
</motion.div>
```

### Scroll Animations
```tsx
import { useInView } from 'react-intersection-observer';

const [ref, inView] = useInView({
  threshold: 0.2,
  triggerOnce: true,
});

<div ref={ref}>
  {inView && <AnimatedContent />}
</div>
```

---

## 🎯 Tailwind Utility Classes

### Layout
```html
<div className="container-custom">  <!-- Max-width container -->
<section className="section">      <!-- Standard section padding -->
<section className="section-hero">  <!-- Full-height hero -->
```

### Forms
```html
<input className="input-field w-full" />
```

### Buttons (CSS)
```html
<button className="btn-primary">Primary</button>
<button className="btn-secondary">Secondary</button>
<button className="btn-ghost">Ghost</button>
```

### Cards (CSS)
```html
<div className="card">Standard card</div>
<div className="card-image">Image card with overlay</div>
```

### Text
```html
<h1 className="text-gradient">Gradient text</h1>
<p className="text-muted">Muted text</p>
```

### Navigation
```html
<header className="nav-blur">Blurred header</header>
```

---

## 🎨 Color Palette

### CSS Variables
```css
var(--color-primary)       /* #000000 */
var(--color-secondary)     /* #ffffff */
var(--color-muted)         /* #6b7280 */
var(--color-border)        /* #e5e7eb */
```

### Tailwind Classes
```html
<div className="bg-black text-white">
<div className="bg-white text-gray-900">
<div className="bg-gray-50 text-gray-700">
<div className="border border-gray-200">
```

---

## 📱 Responsive Design

### Breakpoints
```tsx
// Mobile-first approach
className="text-base md:text-lg lg:text-xl"
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
className="hidden md:block"  // Desktop only
className="md:hidden"         // Mobile only
```

---

## 🎭 Animation Presets

### Framer Motion Variants
```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

<motion.div variants={containerVariants} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.div key={item.id} variants={itemVariants}>
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

---

## 🔧 Common Patterns

### Page Layout
```tsx
import { motion } from 'framer-motion';
import Card from '../components/common/Card/Card';

export default function MyPage() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Page Title
        </h1>
        <p className="text-gray-600 mb-8">
          Page description
        </p>

        <Card>
          {/* Content */}
        </Card>
      </motion.div>
    </div>
  );
}
```

### Form Pattern
```tsx
const [formData, setFormData] = useState({
  name: '',
  email: '',
});

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  // Handle submission
};

return (
  <form onSubmit={handleSubmit} className="space-y-6">
    <div>
      <label className="block text-sm font-medium text-gray-900 mb-2">
        Name
      </label>
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        className="input-field w-full"
      />
    </div>
    <Button type="submit" variant="primary">
      Submit
    </Button>
  </form>
);
```

### Grid Pattern
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map((item, index) => (
    <motion.div
      key={index}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Card>
        <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
        <p className="text-gray-600">{item.description}</p>
      </Card>
    </motion.div>
  ))}
</div>
```

---

## 🎨 Customization

### Extending Tailwind
Edit `tailwind.config.js`:
```js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Add custom colors
        brand: '#your-color',
      },
      spacing: {
        // Add custom spacing
        '128': '32rem',
      },
    },
  },
};
```

### Adding Custom Animations
Edit `tailwind.config.js`:
```js
keyframes: {
  wiggle: {
    '0%, 100%': { transform: 'rotate(-3deg)' },
    '50%': { transform: 'rotate(3deg)' },
  },
},
animation: {
  wiggle: 'wiggle 1s ease-in-out infinite',
},
```

Use: `className="animate-wiggle"`

---

## 📦 Component Library

### Available Components
```
common/
├── Button/       - Buttons (4 variants)
├── Card/         - Cards with hover effects
├── Loading/      - Loading spinners
├── Skeleton/     - Skeleton screens
└── Input/        - Form inputs

layout/
├── Header/       - Sticky header with mobile menu
├── Footer/       - Footer with links
└── Layout/       - Main layout wrapper
```

---

## 🚨 Common Issues

### Issue: Animations not working
**Solution:** Ensure Framer Motion is imported
```tsx
import { motion } from 'framer-motion';
```

### Issue: Tailwind classes not applying
**Solution:** Check `tailwind.config.js` content paths
```js
content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]
```

### Issue: Build fails
**Solution:** Clear cache and rebuild
```bash
rm -rf node_modules dist
npm install
npm run build
```

---

## 📚 Resources

- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [React Router Docs](https://reactrouter.com/)
- [Styled Components Docs](https://styled-components.com/)

---

## ✨ Tips & Tricks

1. **Use motion.div for all animations**
2. **Stick to the color palette for consistency**
3. **Use skeleton screens for loading states**
4. **Test on mobile devices early**
5. **Keep animations subtle and fast (300-600ms)**
6. **Use Intersection Observer for scroll animations**
7. **Prefer Tailwind utilities over custom CSS**
8. **Use semantic HTML elements**

---

**Happy Coding! 🚀**
