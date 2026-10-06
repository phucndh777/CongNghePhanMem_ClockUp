import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

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

export default Register;
