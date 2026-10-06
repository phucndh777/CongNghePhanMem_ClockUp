import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";

import { supabase } from "./lib/supabase";
import "./styles.css";

import Layout from "./components/Layout";
import Home from "./components/Home";
import Login from "./components/Login";
import Register from "./components/Register";
import Friends from "./components/Friends";
import Profile from "./components/Profile";
import Notifications from "./components/Notifications";
import Rooms from "./components/Rooms";
import Messages from "./components/Messages";
import Admin from "./components/Admin";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  /* AUTH SESSION */
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      });

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setSession(session);
        }
      );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  /* LOAD PROFILE */
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }

    async function loadProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      setProfile(data);
    }

    loadProfile();
  }, [session]);

  return (
    <Layout session={session} profile={profile}>
      <Routes>
        <Route
          path="/"
          element={<Home session={session} />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        <Route
          path="/friends"
          element={
            session ? (
              <Friends session={session} />
            ) : (
              <Home session={session} />
            )
          }
        />

        <Route
          path="/profile/:id"
          element={<Profile session={session} />}
        />

        <Route
          path="/notifications"
          element={
            session ? (
              <Notifications session={session} />
            ) : (
              <Home session={session} />
            )
          }
        />

        <Route
          path="/rooms"
          element={
            session ? (
              <Rooms session={session} />
            ) : (
              <Home session={session} />
            )
          }
        />

        <Route
          path="/messages"
          element={
            session ? (
              <Messages session={session} />
            ) : (
              <Home session={session} />
            )
          }
        />

        <Route
          path="/admin"
          element={<Admin profile={profile} />}
        />
      </Routes>
    </Layout>
  );
}
