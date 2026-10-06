import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";

import { supabase } from "../lib/supabase";
import { requireLogin } from "../utils/auth";

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

export default Login;
