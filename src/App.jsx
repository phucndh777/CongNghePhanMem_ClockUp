import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "./lib/supabase";
import "./styles.css";

/* =========================================================
   HELPER
========================================================= */

function requireLogin(navigate) {
  alert("Bạn cần đăng nhập để sử dụng chức năng này!");
  navigate("/login");
}

/* =========================================================
   LAYOUT
========================================================= */

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
          ClockUp
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

function Home({ session }) {
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState("");
  const [comments, setComments] = useState({});
  const [likedPosts, setLikedPosts] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [likingPostId, setLikingPostId] = useState(null);

  useEffect(() => {
    loadPosts();
  }, [session?.user?.id]);

  async function loadPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select(`
        *,
        profiles (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error("LOAD POSTS ERROR:", error);
      alert(`Không thể tải bài viết: ${error.message}`);
      return;
    }

    const postList = data || [];
    setPosts(postList);

    // Load comments and likes after loading the posts.
    await Promise.all(
      postList.map((post) => loadComments(post.id))
    );

    await loadPostLikes(postList);
  }

  async function loadComments(postId) {
    const { data, error } = await supabase
      .from("comments")
      .select(`
        *,
        profiles (
          username,
          display_name
        )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("LOAD COMMENTS ERROR:", error);
      return;
    }

    setComments((old) => ({
      ...old,
      [postId]: data || [],
    }));
  }

  async function loadPostLikes(postList) {
    const postIds = postList.map((post) => post.id);

    if (postIds.length === 0) {
      setLikeCounts({});
      setLikedPosts({});
      return;
    }

    const { data, error } = await supabase
      .from("post_reactions")
      .select("post_id, user_id, reaction")
      .in("post_id", postIds)
      .eq("reaction", "like");

    if (error) {
      console.error("LOAD LIKES ERROR:", error);
      return;
    }

    const counts = {};
    const mine = {};

    for (const reaction of data || []) {
      counts[reaction.post_id] =
        (counts[reaction.post_id] || 0) + 1;

      if (session?.user?.id === reaction.user_id) {
        mine[reaction.post_id] = true;
      }
    }

    setLikeCounts(counts);
    setLikedPosts(mine);
  }

  async function createPost(e) {
    e.preventDefault();

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (!content.trim()) {
      alert("Hãy nhập nội dung bài viết!");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("posts")
        .insert({
          author_id: session.user.id,
          content: content.trim(),
        });

      if (error) {
        alert(error.message);
        return;
      }

      setContent("");
      await loadPosts();
    } catch (err) {
      console.error("CREATE POST ERROR:", err);
      alert("Có lỗi xảy ra khi đăng bài!");
    } finally {
      setLoading(false);
    }
  }

  async function createComment(postId) {
    if (!session) {
      requireLogin(navigate);
      return;
    }

    const text = (comments[`input-${postId}`] || "").trim();

    if (!text) return;

    // Tìm bài viết để biết chủ bài đăng là ai.
    const post = posts.find((item) => item.id === postId);

    if (!post) {
      alert("Không tìm thấy bài viết!");
      return;
    }

    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        author_id: session.user.id,
        content: text,
      })
      .select(`
        *,
        profiles (
          username,
          display_name
        )
      `)
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    // Cập nhật bình luận ngay trên giao diện.
    setComments((old) => ({
      ...old,
      [`input-${postId}`]: "",
      [postId]: [...(old[postId] || []), data],
    }));

    // Nếu người bình luận không phải chủ bài viết,
    // tạo thông báo cho chủ bài viết.
    if (post.author_id !== session.user.id) {
      const commenterName =
        data?.profiles?.display_name ||
        data?.profiles?.username ||
        "Một người dùng";

      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: post.author_id,
          title: "💬 Có bình luận mới",
          body: `${commenterName} đã bình luận bài viết của bạn: "${text}"`,
          is_read: false,
        });

      if (notificationError) {
        // Bình luận đã được tạo thành công, nên chỉ log lỗi thông báo.
        console.error(
          "CREATE COMMENT NOTIFICATION ERROR:",
          notificationError
        );
      }
    }
  }

  async function toggleLike(postId) {
    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (likingPostId === postId) return;

    const isLiked = !!likedPosts[postId];
    setLikingPostId(postId);

    // Optimistic UI: update the button and count immediately.
    setLikedPosts((old) => ({
      ...old,
      [postId]: !isLiked,
    }));

    setLikeCounts((old) => ({
      ...old,
      [postId]: Math.max(
        0,
        (old[postId] || 0) + (isLiked ? -1 : 1)
      ),
    }));

    try {
      if (isLiked) {
        const { error } = await supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", session.user.id)
          .eq("reaction", "like");

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("post_reactions")
          .upsert(
            {
              post_id: postId,
              user_id: session.user.id,
              reaction: "like",
            },
            {
              onConflict: "post_id,user_id",
            }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error("TOGGLE LIKE ERROR:", err);

      // Roll back optimistic UI when Supabase fails.
      setLikedPosts((old) => ({
        ...old,
        [postId]: isLiked,
      }));

      setLikeCounts((old) => ({
        ...old,
        [postId]: Math.max(
          0,
          (old[postId] || 0) + (isLiked ? 1 : -1)
        ),
      }));

      alert(`Không thể ${isLiked ? "bỏ thích" : "thích"} bài viết: ${err.message}`);
    } finally {
      setLikingPostId(null);
    }
  }

  return (
    <div className="feed">
      {/* HERO */}
      <section className="hero">
        <div>
          <h1>Chào mừng đến ClockUp 👋</h1>
          <p>Mạng xã hội kết hợp Facebook, Reddit và Discord.</p>
        </div>

        {!session && (
          <span className="hint">
            Bạn có thể xem bài viết mà không cần đăng nhập.
          </span>
        )}
      </section>

      {/* CREATE POST */}
      <form className="card composer" onSubmit={createPost}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            session
              ? "Bạn đang nghĩ gì?"
              : "Đăng nhập để đăng bài..."
          }
        />

        <button className="btn" disabled={loading}>
          {loading ? "Đang đăng..." : "Đăng bài"}
        </button>
      </form>

      {/* POSTS */}
      {posts.length === 0 && (
        <div className="card">Chưa có bài đăng nào.</div>
      )}

      {posts.map((post) => {
        const isLiked = !!likedPosts[post.id];
        const currentLikeCount = likeCounts[post.id] || 0;
        const currentCommentCount = (comments[post.id] || []).length;

        return (
          <article className="card post" key={post.id}>
            <div className="post-head">
              <Link to={`/profile/${post.author_id}`}>
                <b>
                  {post.profiles?.display_name ||
                    post.profiles?.username ||
                    "Người dùng"}
                </b>
              </Link>

              <small>
                {new Date(post.created_at).toLocaleString("vi-VN")}
              </small>
            </div>

            <p className="post-content">{post.content}</p>

            {/* ACTIONS */}
            <div className="actions">
              <button
                className={isLiked ? "active" : ""}
                onClick={() => toggleLike(post.id)}
                disabled={likingPostId === post.id}
              >
                {isLiked ? "👍 Đã thích" : "👍 Thích"}
                <span className="action-count">{currentLikeCount}</span>
              </button>

              <button
                onClick={() => {
                  if (!session) {
                    requireLogin(navigate);
                    return;
                  }

                  document
                    .getElementById(`comment-${post.id}`)
                    ?.focus();
                }}
              >
                💬 Bình luận
                <span className="action-count">{currentCommentCount}</span>
              </button>

              <button
                onClick={() => {
                  if (!session) {
                    requireLogin(navigate);
                    return;
                  }

                  alert("Chức năng chia sẻ sẽ được bổ sung.");
                }}
              >
                🔗 Chia sẻ
              </button>
            </div>

            {/* COMMENTS */}
            <div className="comments">
              {(comments[post.id] || []).map((comment) => (
                <div className="comment" key={comment.id}>
                  <b>
                    {comment.profiles?.display_name ||
                      comment.profiles?.username ||
                      "Người dùng"}
                    :
                  </b>{" "}
                  {comment.content}
                </div>
              ))}
            </div>

            {/* COMMENT INPUT */}
            <form
              className="comment-box"
              onSubmit={(e) => {
                e.preventDefault();
                createComment(post.id);
              }}
            >
              <input
                id={`comment-${post.id}`}
                value={comments[`input-${post.id}`] || ""}
                onChange={(e) =>
                  setComments((old) => ({
                    ...old,
                    [`input-${post.id}`]: e.target.value,
                  }))
                }
                placeholder={
                  session
                    ? "Viết bình luận..."
                    : "Đăng nhập để bình luận..."
                }
              />

              <button className="btn small">Gửi</button>
            </form>
          </article>
        );
      })}
    </div>
  );
}

/* =========================================================
   LOGIN
========================================================= */

function Login() {

  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e) {

    e.preventDefault();

    setLoading(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    navigate("/");
  }

  return (
    <div className="auth card">

      <h1>
        Đăng nhập
      </h1>

      <form onSubmit={login}>

        <label>
          Email

          <input
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />

        </label>

        <label>
          Mật khẩu

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            required
          />

        </label>

        <button
          className="btn"
          disabled={loading}
        >
          {loading
            ? "Đang đăng nhập..."
            : "Đăng nhập"}
        </button>

      </form>

      <p>
        Chưa có tài khoản?{" "}
        <Link to="/register">
          Đăng ký
        </Link>
      </p>

    </div>
  );
}

/* =========================================================
   REGISTER
========================================================= */

function Register() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function register(e) {
    e.preventDefault();

    if (loading) return;

    const cleanUsername = username.trim();
    const cleanDisplayName = displayName.trim();
    const cleanEmail = email.trim();

    if (!cleanDisplayName) {
      alert("Vui lòng nhập tên hiển thị!");
      return;
    }

    if (!cleanUsername) {
      alert("Vui lòng nhập username!");
      return;
    }

    if (!cleanEmail) {
      alert("Vui lòng nhập email!");
      return;
    }

    if (password.length < 6) {
      alert("Mật khẩu phải có ít nhất 6 ký tự!");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            username: cleanUsername,
            display_name: cleanDisplayName,
          },
        },
      });

      if (error) {
        console.error("REGISTER ERROR:", error);
        alert(`Đăng ký thất bại: ${error.message}`);
        return;
      }

      console.log("REGISTER SUCCESS:", data);

      // Dù Supabase có tạo session ngay hay yêu cầu xác nhận email,
      // luồng đăng ký của app vẫn đưa người dùng về trang đăng nhập.
      if (data?.session) {
        alert("Đăng ký thành công! Vui lòng đăng nhập.");
      } else {
        alert(
          "Đăng ký thành công!\n\n" +
            "Vui lòng kiểm tra email để xác nhận tài khoản, " +
            "sau đó đăng nhập."
        );
      }

      navigate("/login", { replace: true });
    } catch (err) {
      console.error("REGISTER EXCEPTION:", err);
      alert("Có lỗi xảy ra khi đăng ký. Vui lòng thử lại!");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth card">
      <h1>Tạo tài khoản</h1>

      <form onSubmit={register}>
        <label>
          Tên hiển thị
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nhập tên hiển thị"
            required
          />
        </label>

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nhập username"
            required
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@gmail.com"
            required
          />
        </label>

        <label>
          Mật khẩu
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ít nhất 6 ký tự"
            required
          />
        </label>

        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Đang đăng ký..." : "Đăng ký"}
        </button>
      </form>

      <p>
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </div>
  );
}

/* =========================================================
   FRIENDS
========================================================= */

function Friends({ session }) {

  const navigate = useNavigate();

  const [keyword, setKeyword] =
    useState("");

  const [users, setUsers] =
    useState([]);

  async function searchUsers() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .ilike(
          "username",
          `%${keyword}%`
        )
        .limit(30);

    if (error) {
      alert(error.message);
      return;
    }

    setUsers(data || []);
  }

  async function followUser(userId) {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (userId === session.user.id) {
      return;
    }

    const { error } =
      await supabase
        .from("follows")
        .upsert({
          follower_id:
            session.user.id,
          following_id:
            userId,
        });

    if (error) {
      alert(error.message);
    } else {
      alert("Đã theo dõi!");
    }
  }

  async function addFriend(userId) {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (userId === session.user.id) {
      return;
    }

    const { error } =
      await supabase
        .from("friend_requests")
        .insert({
          sender_id:
            session.user.id,
          receiver_id:
            userId,
        });

    if (error) {
      alert(error.message);
    } else {
      alert(
        "Đã gửi lời mời kết bạn!"
      );
    }
  }

  return (
    <div>

      <h1>
        Bạn bè
      </h1>

      <div className="searchbar">

        <input
          value={keyword}
          onChange={(e) =>
            setKeyword(e.target.value)
          }
          placeholder="Tìm username..."
        />

        <button
          className="btn"
          onClick={searchUsers}
        >
          Tìm
        </button>

      </div>

      <div className="grid">

        {users.map((user) => (

          <div
            className="card user"
            key={user.id}
          >

            <div className="avatar">
              {(
                user.display_name ||
                user.username ||
                "?"
              )[0].toUpperCase()}
            </div>

            <div>

              <Link
                to={`/profile/${user.id}`}
              >
                <b>
                  {
                    user.display_name ||
                    user.username
                  }
                </b>
              </Link>

              <small>
                @{user.username}
              </small>

            </div>

            {user.id !== session.user.id && (

              <div className="user-actions">

                <button
                  className="btn small"
                  onClick={() =>
                    addFriend(user.id)
                  }
                >
                  Kết bạn
                </button>

                <button
                  className="btn ghost small"
                  onClick={() =>
                    followUser(user.id)
                  }
                >
                  Theo dõi
                </button>

              </div>

            )}

          </div>

        ))}

      </div>

    </div>
  );
}

/* =========================================================
   PROFILE
========================================================= */

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

function Notifications({ session }) {

  const [notifications, setNotifications] =
    useState([]);

  useEffect(() => {

    loadNotifications();

  }, []);

  async function loadNotifications() {

    const { data } =
      await supabase
        .from("notifications")
        .select("*")
        .eq(
          "user_id",
          session.user.id
        )
        .order(
          "created_at",
          { ascending: false }
        );

    setNotifications(data || []);

    await supabase
      .from("notifications")
      .update({
        is_read: true,
      })
      .eq(
        "user_id",
        session.user.id
      );
  }

  return (
    <div>

      <h1>
        Thông báo
      </h1>

      {notifications.length === 0 ? (

        <div className="card">
          Chưa có thông báo.
        </div>

      ) : (

        notifications.map(
          (notification) => (

            <div
              className="card notification"
              key={notification.id}
            >

              <h3>
                {notification.title}
              </h3>

              <p>
                {notification.body}
              </p>

              <small>
                {new Date(
                  notification.created_at
                ).toLocaleString("vi-VN")}
              </small>

            </div>

          )
        )

      )}

    </div>
  );
}

/* =========================================================
   ROOMS + DISCORD STYLE CHAT
========================================================= */

function Rooms({ session }) {

  const navigate = useNavigate();

  const [rooms, setRooms] =
    useState([]);

  const [roomName, setRoomName] =
    useState("");

  const [activeRoom, setActiveRoom] =
    useState(null);

  const [channels, setChannels] =
    useState([]);

  const [activeChannel, setActiveChannel] =
    useState(null);

  const [messages, setMessages] =
    useState([]);

  const [message, setMessage] =
    useState("");

  useEffect(() => {

    loadRooms();

  }, []);

  async function loadRooms() {

    const { data } =
      await supabase
        .from("rooms")
        .select("*")
        .order(
          "created_at",
          { ascending: false }
        );

    setRooms(data || []);
  }

  async function createRoom() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (!roomName.trim()) {
      alert("Nhập tên room!");
      return;
    }

    const { data, error } =
      await supabase
        .from("rooms")
        .insert({
          owner_id:
            session.user.id,
          name:
            roomName.trim(),
        })
        .select()
        .single();

    if (error) {
      alert(error.message);
      return;
    }

    setRoomName("");

    loadRooms();

    openRoom(data);
  }

  async function openRoom(room) {

    setActiveRoom(room);

    const { data } =
      await supabase
        .from("room_channels")
        .select("*")
        .eq(
          "room_id",
          room.id
        )
        .order("created_at");

    setChannels(data || []);

    if (data?.length) {
      openChannel(data[0]);
    }
  }

  async function openChannel(channel) {

    setActiveChannel(channel);

    const { data } =
      await supabase
        .from("messages")
        .select(`
          *,
          profiles (
            username,
            display_name
          )
        `)
        .eq(
          "channel_id",
          channel.id
        )
        .order("created_at");

    setMessages(data || []);

    const realtime =
      supabase
        .channel(
          `channel-${channel.id}`
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter:
              `channel_id=eq.${channel.id}`,
          },
          async (payload) => {

            const { data: sender } =
              await supabase
                .from("profiles")
                .select(
                  "username,display_name"
                )
                .eq(
                  "id",
                  payload.new.sender_id
                )
                .single();

            setMessages((old) => [
              ...old,
              {
                ...payload.new,
                profiles: sender,
              },
            ]);
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        realtime
      );
    };
  }

  async function sendMessage() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (!activeChannel) return;

    if (!message.trim()) return;

    const { error } =
      await supabase
        .from("messages")
        .insert({
          channel_id:
            activeChannel.id,
          sender_id:
            session.user.id,
          content:
            message.trim(),
        });

    if (error) {
      alert(error.message);
      return;
    }

    setMessage("");
  }

  return (
    <div className="rooms">

      <h1>
        Discord Rooms
      </h1>

      <div className="room-layout">

        {/* ROOM LIST */}

        <aside className="card sidebar">

          <div className="row">

            <input
              value={roomName}
              onChange={(e) =>
                setRoomName(e.target.value)
              }
              placeholder="Tên room..."
            />

            <button
              className="btn small"
              onClick={createRoom}
            >
              +
            </button>

          </div>

          <hr />

          {rooms.map((room) => (

            <button
              className="room-btn"
              key={room.id}
              onClick={() =>
                openRoom(room)
              }
            >
              💬 {room.name}
            </button>

          ))}

        </aside>

        {/* CHAT */}

        <section className="card chat">

          <h2>
            {activeRoom
              ? activeRoom.name
              : "Chọn một room"}
          </h2>

          <div className="channels">

            {channels.map((channel) => (

              <button
                key={channel.id}
                className={
                  activeChannel?.id ===
                  channel.id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  openChannel(channel)
                }
              >
                # {channel.name}
              </button>

            ))}

          </div>

          <div className="messages">

            {messages.map((msg) => (

              <div
                className="message"
                key={msg.id}
              >

                <b>
                  {
                    msg.profiles
                      ?.display_name ||
                    msg.profiles
                      ?.username ||
                    "Người dùng"
                  }
                </b>

                <span>
                  {msg.content}
                </span>

              </div>

            ))}

          </div>

          <div className="message-box">

            <input
              value={message}
              onChange={(e) =>
                setMessage(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
              placeholder="Nhập tin nhắn..."
            />

            <button
              className="btn"
              onClick={sendMessage}
            >
              Gửi
            </button>

          </div>

        </section>

      </div>

    </div>
  );
}

/* =========================================================
   DIRECT MESSAGE
========================================================= */

function Messages({ session }) {

  const navigate = useNavigate();

  const [users, setUsers] =
    useState([]);

  const [keyword, setKeyword] =
    useState("");

  const [selectedUser, setSelectedUser] =
    useState(null);

  const [message, setMessage] =
    useState("");

  const [messages, setMessages] =
    useState([]);

  async function searchUsers() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    const { data } =
      await supabase
        .from("profiles")
        .select("*")
        .ilike(
          "username",
          `%${keyword}%`
        )
        .neq(
          "id",
          session.user.id
        )
        .limit(20);

    setUsers(data || []);
  }

  async function openChat(user) {

    setSelectedUser(user);

    /*
      Bản MVP sử dụng conversations/messages
      riêng nếu anh tạo thêm bảng.
    */

    alert(
      "Khung DM đã sẵn sàng. Tiếp theo có thể kết nối bảng conversations."
    );
  }

  async function sendMessage() {

    if (!session) {
      requireLogin(navigate);
      return;
    }

    if (!selectedUser) return;

    if (!message.trim()) return;

    /*
      Có thể nối vào bảng direct_messages
      khi thêm schema riêng.
    */

    setMessages((old) => [
      ...old,
      {
        id: Date.now(),
        sender_id:
          session.user.id,
        content:
          message,
      },
    ]);

    setMessage("");
  }

  return (
    <div>

      <h1>
        Tin nhắn
      </h1>

      <div className="searchbar">

        <input
          value={keyword}
          onChange={(e) =>
            setKeyword(e.target.value)
          }
          placeholder="Tìm người để nhắn..."
        />

        <button
          className="btn"
          onClick={searchUsers}
        >
          Tìm
        </button>

      </div>

      <div className="card">

        {users.map((user) => (

          <div
            className="user"
            key={user.id}
          >

            <div className="avatar">
              {(
                user.display_name ||
                user.username
              )[0].toUpperCase()}
            </div>

            <div>

              <b>
                {
                  user.display_name ||
                  user.username
                }
              </b>

              <small>
                @{user.username}
              </small>

            </div>

            <button
              className="btn small"
              onClick={() =>
                openChat(user)
              }
            >
              Nhắn tin
            </button>

          </div>

        ))}

      </div>

      {selectedUser && (

        <div className="card">

          <h2>
            Chat với{" "}
            {
              selectedUser.display_name ||
              selectedUser.username
            }
          </h2>

          <div className="messages">

            {messages.map((msg) => (

              <div
                className="message"
                key={msg.id}
              >
                {msg.content}
              </div>

            ))}

          </div>

          <div className="message-box">

            <input
              value={message}
              onChange={(e) =>
                setMessage(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
            />

            <button
              className="btn"
              onClick={sendMessage}
            >
              Gửi
            </button>

          </div>

        </div>

      )}

    </div>
  );
}

/* =========================================================
   ADMIN
========================================================= */

function Admin({ profile }) {

  const [posts, setPosts] =
    useState([]);

  const [announcement, setAnnouncement] =
    useState("");

  const [maintenance, setMaintenance] =
    useState(false);

  useEffect(() => {

    if (profile?.is_admin) {
      loadPosts();
    }

  }, [profile]);

  async function loadPosts() {

    const { data } =
      await supabase
        .from("posts")
        .select(`
          *,
          profiles (
            username,
            display_name
          )
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    setPosts(data || []);
  }

  async function deletePost(id) {

    const confirmDelete =
      window.confirm(
        "Bạn có chắc muốn xóa bài viết này?"
      );

    if (!confirmDelete) return;

    const { error } =
      await supabase
        .from("posts")
        .delete()
        .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadPosts();
  }

  async function sendAnnouncement() {

    if (!announcement.trim()) {
      alert("Nhập nội dung!");
      return;
    }

    const { data: users } =
      await supabase
        .from("profiles")
        .select("id");

    if (!users) return;

    const notifications =
      users.map((user) => ({
        user_id: user.id,
        title:
          "📢 Thông báo toàn server",
        body:
          announcement,
      }));

    const { error } =
      await supabase
        .from("notifications")
        .insert(
          notifications
        );

    if (error) {
      alert(error.message);
      return;
    }

    setAnnouncement("");

    alert(
      "Đã gửi thông báo đến toàn server!"
    );
  }

  async function toggleMaintenance() {

    const next =
      !maintenance;

    await supabase
      .from("system_settings")
      .upsert({
        key: "maintenance",
        value: {
          enabled: next,
        },
      });

    setMaintenance(next);
  }

  if (!profile?.is_admin) {

    return (
      <div className="card">

        <h2>
          Không có quyền truy cập
        </h2>

        <p>
          Trang này chỉ dành cho Admin.
        </p>

      </div>
    );

  }

  return (
    <div>

      <h1>
        Admin Dashboard
      </h1>

      <div className="admin-grid">

        {/* MODERATION */}

        <section className="card">

          <h2>
            🛡️ Kiểm duyệt bài đăng
          </h2>

          <p className="hint">
            Admin có thể xem và xóa nội dung vi phạm.
          </p>

          {posts.map((post) => (

            <div
              className="moderate"
              key={post.id}
            >

              <div>

                <b>
                  {
                    post.profiles
                      ?.display_name ||
                    post.profiles
                      ?.username
                  }
                </b>

                <p>
                  {post.content}
                </p>

              </div>

              <button
                className="btn danger small"
                onClick={() =>
                  deletePost(post.id)
                }
              >
                Xóa
              </button>

            </div>

          ))}

        </section>

        {/* SYSTEM */}

        <section className="card">

          <h2>
            📢 Thông báo toàn server
          </h2>

          <textarea
            value={announcement}
            onChange={(e) =>
              setAnnouncement(
                e.target.value
              )
            }
            placeholder="Nhập thông báo..."
          />

          <br />
          <br />

          <button
            className="btn"
            onClick={
              sendAnnouncement
            }
          >
            Gửi thông báo
          </button>

          <hr />

          <h2>
            🔧 Bảo trì hệ thống
          </h2>

          <p>
            Trạng thái:{" "}
            <b>
              {maintenance
                ? "ĐANG BẢO TRÌ"
                : "ĐANG HOẠT ĐỘNG"}
            </b>
          </p>

          <button
            className="btn"
            onClick={
              toggleMaintenance
            }
          >
            {maintenance
              ? "Tắt bảo trì"
              : "Bật bảo trì"}
          </button>

        </section>

      </div>

    </div>
  );
}

/* =========================================================
   APP
========================================================= */

export default function App() {

  const [session, setSession] =
    useState(null);

  const [profile, setProfile] =
    useState(null);

  /* AUTH SESSION */

  useEffect(() => {

    supabase.auth
      .getSession()
      .then(({ data }) => {

        setSession(
          data.session
        );

      });

    const {
      data: listener,
    } =
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

      const { data } =
        await supabase
          .from("profiles")
          .select("*")
          .eq(
            "id",
            session.user.id
          )
          .single();

      setProfile(data);

    }

    loadProfile();

  }, [session]);

  return (
    <Layout
      session={session}
      profile={profile}
    >

      <Routes>

        {/* HOME */}

        <Route
          path="/"
          element={
            <Home
              session={session}
            />
          }
        />

        {/* AUTH */}

        <Route
          path="/login"
          element={
            <Login />
          }
        />

        <Route
          path="/register"
          element={
            <Register />
          }
        />

        {/* FRIENDS */}

        <Route
          path="/friends"
          element={
            session ? (
              <Friends
                session={session}
              />
            ) : (
              <Home
                session={session}
              />
            )
          }
        />

        {/* PROFILE */}

        <Route
          path="/profile/:id"
          element={
            <Profile
              session={session}
            />
          }
        />

        {/* NOTIFICATIONS */}

        <Route
          path="/notifications"
          element={
            session ? (
              <Notifications
                session={session}
              />
            ) : (
              <Home
                session={session}
              />
            )
          }
        />

        {/* ROOMS */}

        <Route
          path="/rooms"
          element={
            session ? (
              <Rooms
                session={session}
              />
            ) : (
              <Home
                session={session}
              />
            )
          }
        />

        {/* DIRECT MESSAGES */}

        <Route
          path="/messages"
          element={
            session ? (
              <Messages
                session={session}
              />
            ) : (
              <Home
                session={session}
              />
            )
          }
        />

        {/* ADMIN */}

        <Route
          path="/admin"
          element={
            <Admin
              profile={profile}
            />
          }
        />

      </Routes>

    </Layout>
  );
}