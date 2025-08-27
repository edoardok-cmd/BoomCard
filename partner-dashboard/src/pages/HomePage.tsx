import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';

const HomePage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Welcome to BoomCard
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Enterprise Platform for Digital Business Cards
        </p>
        <div className="flex justify-center gap-4">
          <Link to="/dashboard">
            <Button variant="primary" size="large">
              Go to Dashboard
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" size="large">
              Sign In
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mt-16">
        <Card>
          <h3 className="text-xl font-semibold mb-4">Real-time Analytics</h3>
          <p className="text-gray-600">
            Track your business card performance with real-time analytics and insights.
          </p>
        </Card>
        <Card>
          <h3 className="text-xl font-semibold mb-4">QR Code Generation</h3>
          <p className="text-gray-600">
            Generate unique QR codes for your digital business cards instantly.
          </p>
        </Card>
        <Card>
          <h3 className="text-xl font-semibold mb-4">Team Management</h3>
          <p className="text-gray-600">
            Manage your entire team's business cards from one centralized platform.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default HomePage;