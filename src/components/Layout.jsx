import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

function Layout({ session, profile, children }) {
  const navigate = useNavigate();
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (!session) {
      setNotificationCount(0);
      return;
    }

    loadNotificationCount();

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          loadNotificationCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  async function loadNotificationCount() {
    if (!session) return;

    const { count } = await supabase
      .from("notifications")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("user_id", session.user.id)
      .eq("is_read", false);

    setNotificationCount(count || 0);
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div className="app">

      {/* HEADER */}

      <header className="topbar">

        <Link to="/" className="brand">
          ConnectHub
        </Link>

        <nav>

          <NavLink to="/">
            🏠 Trang chủ
          </NavLink>

          {session && (
            <NavLink to="/friends">
              👥 Bạn bè
            </NavLink>
          )}

          {session && (
            <NavLink to="/rooms">
              💬 Rooms
            </NavLink>
          )}

          {session && (
            <NavLink to="/messages">
              ✉️ Tin nhắn
            </NavLink>
          )}

          {session && (
            <NavLink to="/notifications">
              🔔 Thông báo

              {notificationCount > 0 && (
                <span className="badge">
                  {notificationCount}
                </span>
              )}

            </NavLink>
          )}

          {session && (
            <NavLink to={`/profile/${session.user.id}`}>
              👤 Profile
            </NavLink>
          )}

          {profile?.is_admin && (
            <NavLink to="/admin">
              🛡️ Admin
            </NavLink>
          )}

        </nav>

        <div className="account">

          {session ? (
            <button
              className="btn ghost"
              onClick={logout}
            >
              Đăng xuất
            </button>
          ) : (
            <>
              <Link
                to="/login"
                className="btn ghost"
              >
                Đăng nhập
              </Link>

              <Link
                to="/register"
                className="btn"
              >
                Đăng ký
              </Link>
            </>
          )}

        </div>

      </header>

      <main className="container">
        {children}
      </main>

    </div>
  );
}

/* =========================================================
   HOME
========================================================= */

export default Layout;
