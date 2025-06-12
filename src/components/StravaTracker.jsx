import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Calendar, Target, Bike, TrendingUp, Edit2, Loader2 } from 'lucide-react'; // Added Loader2
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
  const [isLoading, setIsLoading] = useState(false); // New loading state
  const [accessToken, setAccessToken] = useState(() => {
    return localStorage.getItem('stravaAccessToken');
  });
  const [refreshToken, setRefreshToken] = useState(() => {
    return localStorage.getItem('stravaRefreshToken');
  });
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [yearGoal, setYearGoal] = useState(() => {
    const savedGoal = localStorage.getItem('cyclingYearGoal');
    return savedGoal ? parseInt(savedGoal) : DEFAULT_GOAL;
  });

  const isFetchingActivities = useRef(false);

  const handleLogout = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem('stravaAccessToken');
    localStorage.removeItem('stravaRefreshToken');
    setIsAuthenticated(false);
    setTotalKm(0); // Reset totalKm on logout
  }, [setAccessToken, setRefreshToken, setIsAuthenticated, setTotalKm]);

  const isCyclingActivity = useCallback((activityType) => {
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
  }, []);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken) {
      console.error('No refresh token available. User needs to reauthenticate.');
      handleLogout();
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      const data = await response.json();

      if (data.access_token && data.refresh_token) {
        setAccessToken(data.access_token);
        setRefreshToken(data.refresh_token);
        localStorage.setItem('stravaAccessToken', data.access_token);
        localStorage.setItem('stravaRefreshToken', data.refresh_token);
        // fetchActivities will be called by the useEffect hook watching accessToken
      } else {
        console.error('Failed to refresh access token. User needs to reauthenticate.');
        handleLogout();
      }
    } catch (error) {
      console.error('Error refreshing access token:', error);
      handleLogout();
    } finally {
      setIsLoading(false);
    }
  }, [refreshToken, handleLogout, setAccessToken, setRefreshToken, setIsLoading]);

  const fetchActivities = useCallback(async () => {
    if (!accessToken || isFetchingActivities.current) return;

    isFetchingActivities.current = true;
    setIsLoading(true);

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
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.status === 401) {
          // Access token is invalid or expired, refresh it
          await refreshAccessToken();
          // Let useEffect handle retrying fetchActivities if token is successfully refreshed
          // Reset flag here as this instance of fetchActivities is done.
          isFetchingActivities.current = false;
          setIsLoading(false); // Also reset loading state
          return; // Exit this attempt
        }

        const activities = await response.json();
        if (activities.errors && activities.errors.some(err => err.code === 'invalid')) {
          console.error('Invalid access token. User needs to reauthenticate.');
          handleLogout();
          isFetchingActivities.current = false; // Reset the flag
          return;
        }

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
    } finally {
      isFetchingActivities.current = false;
      setIsLoading(false);
    }
  }, [accessToken, refreshAccessToken, handleLogout, isCyclingActivity, setTotalKm, setIsLoading]);

  const exchangeToken = useCallback(async (code) => {
    setIsLoading(true);
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
      setRefreshToken(data.refresh_token);
      localStorage.setItem('stravaAccessToken', data.access_token);
      localStorage.setItem('stravaRefreshToken', data.refresh_token);
      setIsAuthenticated(true);
      // fetchActivities will be called by useEffect due to accessToken change
      // No direct call to fetchActivities() here to avoid potential race conditions with isLoading

      // Remove query parameters from the URL
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } catch (error) {
      console.error('Error exchanging token:', error);
    } finally {
      setIsLoading(false);
    }
  }, [setIsAuthenticated, setAccessToken, setRefreshToken, setIsLoading]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');

    if (authCode && !isAuthenticated && !accessToken) {
      exchangeToken(authCode);
    } else if (accessToken && !isAuthenticated) {
      // If token exists in localStorage but not authenticated yet
      setIsAuthenticated(true); // This will trigger the next condition in the following render
    } else if (accessToken && isAuthenticated) {
      // Only fetch activities if authenticated and token is present
      // This also runs if accessToken is updated by refreshAccessToken
      fetchActivities();
    }
  }, [accessToken, isAuthenticated, fetchActivities, exchangeToken]);

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

  const handleLogin = () => {
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}`;
    window.location.href = authUrl;
  };


  // Initial loading state before authentication is determined, or during token exchange
  if (isLoading && !isAuthenticated && !localStorage.getItem('stravaAccessToken')) {
    return (
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Connecting to Strava...</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please wait while we process your authorization.</p>
          {/* You could add a spinner icon here */}
        </CardContent>
      </Card>
    );
  }

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
  const startOfYearDate = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYearDate) / (24 * 60 * 60 * 1000)) + 1;
  const year = now.getFullYear();
  const isLeap = new Date(year, 1, 29).getDate() === 29;
  const daysInYear = isLeap ? 366 : 365;
  
  const percentComplete = yearGoal > 0 ? (totalKm / yearGoal) * 100 : 0;
  const expectedProgress = (dayOfYear / daysInYear) * 100;
  const expectedDistance = yearGoal > 0 ? (yearGoal / 100) * expectedProgress : 0;
  const projectedDistance = dayOfYear > 0 ? (totalKm / dayOfYear) * daysInYear : 0;
  const remainingKm = yearGoal - totalKm;
  const remainingDays = daysInYear - dayOfYear;
  const requiredDaily = remainingDays > 0 ? remainingKm / remainingDays : 0;

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
          {isLoading && totalKm === 0 && isAuthenticated ? (
            <div className="space-y-6">
              {/* Year Goal section */}
              <div className="flex items-center gap-4">
                <div className="font-medium">Year Goal:</div>
                <div>{yearGoal} km</div>
              </div>

              {/* Animated Progress Bar section */}
              <div className="space-y-2">
                <div className="h-4 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-400 animate-pulse"
                    style={{ width: `100%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>0 km</span>
                  <span>{yearGoal} km</span>
                </div>
              </div>
              
              {/* Metrics Grid - Loading State */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Progress Metric with Spinner */}
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="font-medium">Progress</div>
                    <div className="flex items-center gap-1">
                      <span>Loading...</span>
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                </div>
                
                {/* Expected Progress - Display actual values */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="font-medium">Expected Progress</div>
                    <div>{expectedDistance.toFixed(1)} km ({expectedProgress.toFixed(1)}%)</div>
                  </div>
                </div>
                
                {/* Projected Year-End - Placeholder */}
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="font-medium">Projected Year-End</div>
                    <div>Calculating...</div>
                  </div>
                </div>
                
                {/* Required Daily - Placeholder */}
                <div className="flex items-center gap-2">
                  <Bike className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="font-medium">Required Daily</div>
                    <div>Calculating...</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StravaTracker;
