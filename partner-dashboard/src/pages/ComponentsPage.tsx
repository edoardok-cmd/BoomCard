import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Button from '../components/common/Button/Button';
import Card from '../components/common/Card/Card';
import Badge from '../components/common/Badge/Badge';
import Alert from '../components/common/Alert/Alert';
import Loading from '../components/common/Loading/Loading';
import { Skeleton, SkeletonText, SkeletonAvatar } from '../components/common/Skeleton/Skeleton';

export default function ComponentsPage() {
  const [showAlert, setShowAlert] = useState(true);

  return (
    <div className="max-w-7xl mx-auto py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Component Showcase
          </h1>
          <p className="text-xl text-gray-600">
            Complete component library with Whoop-inspired minimalist design
          </p>
        </div>

        {/* Buttons */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 mb-6">Buttons</h2>
          <Card>
            <div className="space-y-6">
              {/* Variants */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Variants</h3>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </div>
              </div>

              {/* Sizes */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Sizes</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" size="small">Small</Button>
                  <Button variant="primary" size="medium">Medium</Button>
                  <Button variant="primary" size="large">Large</Button>
                </div>
              </div>

              {/* States */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">States</h3>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">Normal</Button>
                  <Button variant="primary" disabled>Disabled</Button>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Cards */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 mb-6">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Basic Card</h3>
              <p className="text-gray-600">
                Cards have hover effects and soft shadows.
              </p>
            </Card>
            <Card>
              <h3 className="text-xl font-semibold mb-2 text-gray-900">With Content</h3>
              <p className="text-gray-600 mb-4">
                Perfect for displaying grouped information.
              </p>
              <Button variant="secondary" size="small">Learn More</Button>
            </Card>
            <Card>
              <h3 className="text-xl font-semibold mb-2 text-gray-900">Interactive</h3>
              <p className="text-gray-600">
                Hover to see the lift effect.
              </p>
            </Card>
          </div>
        </section>

        {/* Badges */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 mb-6">Badges</h2>
          <Card>
            <div className="space-y-6">
              {/* Variants */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Variants</h3>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="error">Error</Badge>
                  <Badge variant="info">Info</Badge>
                </div>
              </div>

              {/* Sizes */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Sizes</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="success" size="small">Small</Badge>
                  <Badge variant="success" size="medium">Medium</Badge>
                  <Badge variant="success" size="large">Large</Badge>
                </div>
              </div>

              {/* With Dot */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">With Dot Indicator</h3>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="success" dot>Active</Badge>
                  <Badge variant="warning" dot>Pending</Badge>
                  <Badge variant="error" dot>Offline</Badge>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Alerts */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 mb-6">Alerts</h2>
          <div className="space-y-4">
            {showAlert && (
              <Alert
                variant="success"
                title="Success"
                onClose={() => setShowAlert(false)}
              >
                Your changes have been saved successfully!
              </Alert>
            )}
            <Alert variant="info" title="Information">
              This is an informational message.
            </Alert>
            <Alert variant="warning" title="Warning">
              Please review your settings before continuing.
            </Alert>
            <Alert variant="error" title="Error">
              An error occurred while processing your request.
            </Alert>
          </div>
        </section>

        {/* Loading States */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 mb-6">Loading States</h2>
          <Card>
            <div className="space-y-6">
              {/* Spinners */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Spinners</h3>
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <Loading size="small" />
                    <p className="text-sm text-gray-600 mt-2">Small</p>
                  </div>
                  <div className="text-center">
                    <Loading size="medium" />
                    <p className="text-sm text-gray-600 mt-2">Medium</p>
                  </div>
                  <div className="text-center">
                    <Loading size="large" />
                    <p className="text-sm text-gray-600 mt-2">Large</p>
                  </div>
                </div>
              </div>

              {/* Skeleton */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Skeleton Screens</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <SkeletonAvatar />
                    <div className="flex-1">
                      <Skeleton height="1rem" width="40%" className="mb-2" />
                      <Skeleton height="0.875rem" width="60%" />
                    </div>
                  </div>
                  <SkeletonText lines={3} />
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Form Elements */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 mb-6">Form Elements</h2>
          <Card>
            <form className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Text Input
                </label>
                <input
                  type="text"
                  className="input-field w-full"
                  placeholder="Enter text..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Email Input
                </label>
                <input
                  type="email"
                  className="input-field w-full"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Textarea
                </label>
                <textarea
                  className="input-field w-full"
                  rows={4}
                  placeholder="Enter your message..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Select
                </label>
                <select className="input-field w-full">
                  <option>Option 1</option>
                  <option>Option 2</option>
                  <option>Option 3</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="checkbox-demo"
                  className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                />
                <label htmlFor="checkbox-demo" className="text-sm text-gray-700">
                  I agree to the terms and conditions
                </label>
              </div>

              <Button type="submit" variant="primary">
                Submit Form
              </Button>
            </form>
          </Card>
        </section>

        {/* Typography */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 mb-6">Typography</h2>
          <Card>
            <div className="space-y-4">
              <h1 className="text-5xl font-bold text-gray-900">Heading 1</h1>
              <h2 className="text-4xl font-semibold text-gray-900">Heading 2</h2>
              <h3 className="text-3xl font-semibold text-gray-900">Heading 3</h3>
              <h4 className="text-2xl font-semibold text-gray-900">Heading 4</h4>
              <h5 className="text-xl font-semibold text-gray-900">Heading 5</h5>
              <h6 className="text-lg font-semibold text-gray-900">Heading 6</h6>
              <p className="text-base text-gray-700">
                Body text - The quick brown fox jumps over the lazy dog.
              </p>
              <p className="text-sm text-gray-600">
                Small text - The quick brown fox jumps over the lazy dog.
              </p>
              <p className="text-xs text-gray-500">
                Extra small text - The quick brown fox jumps over the lazy dog.
              </p>
            </div>
          </Card>
        </section>

        {/* Colors */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 mb-6">Color Palette</h2>
          <Card>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Primary Colors</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="h-20 bg-black rounded-lg mb-2"></div>
                    <p className="text-sm font-medium">Black</p>
                    <p className="text-xs text-gray-500">#000000</p>
                  </div>
                  <div>
                    <div className="h-20 bg-white border border-gray-200 rounded-lg mb-2"></div>
                    <p className="text-sm font-medium">White</p>
                    <p className="text-xs text-gray-500">#FFFFFF</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Grays</h3>
                <div className="grid grid-cols-5 gap-2">
                  {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((shade) => (
                    <div key={shade}>
                      <div className={`h-16 bg-gray-${shade} rounded-lg mb-2`}></div>
                      <p className="text-xs font-medium">{shade}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Functional Colors</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="h-20 bg-green-500 rounded-lg mb-2"></div>
                    <p className="text-sm font-medium">Success</p>
                  </div>
                  <div>
                    <div className="h-20 bg-yellow-500 rounded-lg mb-2"></div>
                    <p className="text-sm font-medium">Warning</p>
                  </div>
                  <div>
                    <div className="h-20 bg-red-500 rounded-lg mb-2"></div>
                    <p className="text-sm font-medium">Error</p>
                  </div>
                  <div>
                    <div className="h-20 bg-blue-500 rounded-lg mb-2"></div>
                    <p className="text-sm font-medium">Info</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>
      </motion.div>
    </div>
  );
}
