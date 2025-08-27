import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '../components/common/Card/Card';
import axios from 'axios';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const DashboardPage: React.FC = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await axios.get('/api/analytics/dashboard');
      return response.data;
    },
  });

  const mockData = [
    { name: 'Mon', views: 4000, shares: 2400 },
    { name: 'Tue', views: 3000, shares: 1398 },
    { name: 'Wed', views: 2000, shares: 9800 },
    { name: 'Thu', views: 2780, shares: 3908 },
    { name: 'Fri', views: 1890, shares: 4800 },
    { name: 'Sat', views: 2390, shares: 3800 },
    { name: 'Sun', views: 3490, shares: 4300 },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Cards</h3>
          <p className="text-3xl font-bold">1,234</p>
          <p className="text-sm text-green-600 mt-1">+12% from last month</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Views</h3>
          <p className="text-3xl font-bold">45,678</p>
          <p className="text-sm text-green-600 mt-1">+8% from last month</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Active Users</h3>
          <p className="text-3xl font-bold">892</p>
          <p className="text-sm text-red-600 mt-1">-2% from last month</p>
        </Card>
        <Card>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Conversion Rate</h3>
          <p className="text-3xl font-bold">3.4%</p>
          <p className="text-sm text-green-600 mt-1">+0.5% from last month</p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold mb-4">Weekly Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mockData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="views" stroke="#8884d8" />
              <Line type="monotone" dataKey="shares" stroke="#82ca9d" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold mb-4">Card Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mockData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="views" fill="#8884d8" />
              <Bar dataKey="shares" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <p className="font-medium">New card created</p>
              <p className="text-sm text-gray-500">John Doe created a new business card</p>
            </div>
            <p className="text-sm text-gray-500">5 mins ago</p>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <div>
              <p className="font-medium">QR Code scanned</p>
              <p className="text-sm text-gray-500">Sarah's card was scanned in New York</p>
            </div>
            <p className="text-sm text-gray-500">12 mins ago</p>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Team member added</p>
              <p className="text-sm text-gray-500">Mike Johnson joined the Sales team</p>
            </div>
            <p className="text-sm text-gray-500">1 hour ago</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DashboardPage;