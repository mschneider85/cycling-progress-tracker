import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Calendar, Target, Bike, TrendingUp, Edit2 } from 'lucide-react';
import StravaConnectButton from './StravaConnectButton';
import imgPoweredByStrava from '../assets/api_logo_pwrdBy_strava_horiz_light.svg';

const CLIENT_ID = process.env.REACT_APP_STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.REACT_APP_STRAVA_CLIENT_SECRET;
const REDIRECT_URI = process.env.REACT_APP_STRAVA_REDIRECT_URI || 'http://localhost:3000';
const SCOPE = 'read,activity:read_all';
const DEFAULT_GOAL = 10000;

const StravaTracker = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [totalKm, setTotalKm] = useState(0);
  const [accessToken, setAccessToken] = useState(null);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [yearGoal, setYearGoal] = useState(() => {
    const savedGoal = localStorage.getItem('cyclingYearGoal');
    return savedGoal ? parseInt(savedGoal) : DEFAULT_GOAL;
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');

    if (authCode && !isAuthenticated) {
      exchangeToken(authCode);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cyclingYearGoal', yearGoal.toString());
  }, [yearGoal]);

  const handleGoalChange = (event) => {
    const newGoal = parseInt(event.target.value) || 0;
    setYearGoal(newGoal);
  };

  const handleGoalSubmit = (event) => {
    event.preventDefault();
    setIsEditingGoal(false);
  };

  const isCyclingActivity = (activityType) => {
    const cyclingTypes = [
      'Ride',
      'VirtualRide',
      'GravelRide',
      'EBikeRide',
      'MountainBikeRide',
      'HandCycle',
      'Velomobile'
    ];
    return cyclingTypes.includes(activityType);
  };

  const exchangeToken = async (code) => {
    try {
      const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
        }),
      });

      const data = await response.json();
      setAccessToken(data.access_token);
      setIsAuthenticated(true);
      fetchActivities(data.access_token);

      // Remove query parameters from the URL
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } catch (error) {
      console.error('Error exchanging token:', error);
    }
  };

  const fetchActivities = async (token) => {
    try {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      let page = 1;
      let allActivities = [];
      let hasMoreActivities = true;

      while (hasMoreActivities) {
        const response = await fetch(
          `https://www.strava.com/api/v3/athlete/activities?after=${startOfYear}&per_page=200&page=${page}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const activities = await response.json();
        if (activities.length > 0) {
          allActivities = allActivities.concat(activities);
          page++;
        } else {
          hasMoreActivities = false;
        }
      }

      const totalDistance = allActivities.reduce((sum, activity) => {
        if (isCyclingActivity(activity.type)) {
          return sum + activity.distance / 1000;
        }
        return sum;
      }, 0);

      setTotalKm(totalDistance);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const handleLogin = () => {
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}`;
    window.location.href = authUrl;
  };

  if (!isAuthenticated) {
    return (
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Start Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <StravaConnectButton onClick={handleLogin} /> {/* Use the SVG button */}
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
  const daysInYear = new Date(now.getFullYear(), 11, 31).getDate() + 334;
  
  const percentComplete = (totalKm / yearGoal) * 100;
  const expectedProgress = (dayOfYear / daysInYear) * 100;
  const expectedDistance = (yearGoal / 100) * expectedProgress;
  const projectedDistance = (totalKm / dayOfYear) * daysInYear;
  const remainingKm = yearGoal - totalKm;
  const remainingDays = daysInYear - dayOfYear;
  const requiredDaily = remainingKm / remainingDays;

  return (
    <div className="w-full max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-between flex-col md:flex-row">
            <div class="flex items-center gap-2">
              <Bike className="h-6 w-6" />
              Cycling Challenge Progress Tracker
            </div>
            <img
              src={imgPoweredByStrava}
              alt="Connect with Strava"
              className="h-8 w-auto"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="font-medium">Year Goal:</div>
              {isEditingGoal ? (
                <form onSubmit={handleGoalSubmit} className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={yearGoal}
                    onChange={handleGoalChange}
                    className="w-32"
                    min="1"
                    required
                  />
                  <button
                    type="submit"
                    className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-sm"
                  >
                    Save
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <span>{yearGoal} km</span>
                  <button
                    onClick={() => setIsEditingGoal(true)}
                    className="text-blue-500 hover:text-blue-600"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="h-4 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${Math.min(percentComplete, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>0 km</span>
                <span>{yearGoal} km</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="font-medium">Progress</div>
                  <div>{totalKm.toFixed(1)} km ({percentComplete.toFixed(1)}%)</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="font-medium">Expected Progress</div>
                  <div>{expectedDistance.toFixed(1)} km ({expectedProgress.toFixed(1)}%)</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="font-medium">Projected Year-End</div>
                  <div>{projectedDistance.toFixed(1)} km</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Bike className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="font-medium">Required Daily</div>
                  <div>{requiredDaily.toFixed(1)} km/day</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StravaTracker;
