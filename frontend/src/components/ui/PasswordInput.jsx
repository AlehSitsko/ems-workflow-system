import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";

/**
 * A password field with a show/hide (eye) toggle. Renders a Bootstrap input-group
 * so it drops in wherever a plain `<input type="password" className="form-control">`
 * was used. All extra props pass through to the underlying input.
 *
 * The toggle button is `tabIndex={-1}` so it never sits between the field and the
 * submit button in the tab order.
 */
export default function PasswordInput({ id, name, value, onChange, autoComplete, placeholder, required, disabled, className = "", ...rest }) {
  const [show, setShow] = useState(false);
  const label = show ? "Hide password" : "Show password";
  return (
    <div className="input-group">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        className={`form-control ${className}`.trim()}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        {...rest}
      />
      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={label}
        title={label}
        disabled={disabled}
      >
        {show ? <FaEyeSlash /> : <FaEye />}
      </button>
    </div>
  );
}
