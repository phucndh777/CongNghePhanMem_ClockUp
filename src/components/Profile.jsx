import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

function Profile({ session }) {

  const { id } = useParams();

  const navigate = useNavigate();

  const [profile, setProfile] =
    useState(null);

  const [blocked, setBlocked] =
    useState(false);

  const [following, setFollowing] =
    useState(false);

  useEffect(() => {

    loadProfile();

  }, [id, session]);

  async function loadProfile() {

    const { data } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

    setProfile(data);

    if (!session) return;

    const { data: blockData } =
      await supabase
        .from("blocks")
        .select("id")
        .eq(
          "blocker_id",
          session.user.id
        )
        .eq(
          "blocked_id",
          id
        )
        .maybeSingle();

    setBlocked(!!blockData);

    const { data: followData } =
      await supabase
        .from("follows")
        .select("id")
        .eq(
          "follower_id",
          session.user.id
        )
        .eq(
          "following_id",
          id
        )
        .maybeSingle();

    setFollowing(!!followData);
  }

  async function toggleFollow() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (following) {

      await supabase
        .from("follows")
        .delete()
        .eq(
          "follower_id",
          session.user.id
        )
        .eq(
          "following_id",
          id
        );

      setFollowing(false);

    } else {

      await supabase
        .from("follows")
        .insert({
          follower_id:
            session.user.id,
          following_id:
            id,
        });

      setFollowing(true);

    }
  }

  async function toggleBlock() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (id === session.user.id) {
      return;
    }

    if (blocked) {

      await supabase
        .from("blocks")
        .delete()
        .eq(
          "blocker_id",
          session.user.id
        )
        .eq(
          "blocked_id",
          id
        );

      setBlocked(false);

    } else {

      await supabase
        .from("blocks")
        .insert({
          blocker_id:
            session.user.id,
          blocked_id:
            id,
        });

      setBlocked(true);

    }
  }

  if (!profile) {

    return (
      <div className="card">
        Đang tải profile...
      </div>
    );

  }

  const name =
    profile.display_name ||
    profile.username;

  return (
    <div className="profile">

      <div className="cover"></div>

      <div className="card profile-main">

        <div className="avatar big">
          {name[0].toUpperCase()}
        </div>

        <h1>
          {name}
        </h1>

        <p>
          @{profile.username}
        </p>

        <p>
          {profile.bio ||
            "Chưa có giới thiệu."}
        </p>

        {session &&
          id !== session.user.id && (

            <div className="actions">

              <button
                className="btn"
                onClick={toggleFollow}
              >
                {following
                  ? "Bỏ theo dõi"
                  : "Theo dõi"}
              </button>

              <button
                className="btn danger"
                onClick={toggleBlock}
              >
                {blocked
                  ? "Bỏ chặn"
                  : "Chặn"}
              </button>

            </div>

          )}

      </div>

    </div>
  );
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

export default Profile;
