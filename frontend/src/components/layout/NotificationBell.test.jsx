import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NotificationBell from "./NotificationBell";

const notif = (over = {}) => ({
  id: 1, type: "call_new_today", title: "New call today", body: "Details",
  severity: "info", is_read: false, created_at: new Date().toISOString(), ...over,
});

const setup = (props = {}) => {
  const markRead = vi.fn();
  const markAllRead = vi.fn();
  render(<NotificationBell notifications={[]} unreadCount={0}
                           markRead={markRead} markAllRead={markAllRead} {...props} />);
  return { markRead, markAllRead };
};

const openPanel = () => fireEvent.click(screen.getByTitle("Notifications"));

describe("NotificationBell", () => {
  it("has an accessible bell control", () => {
    setup();
    expect(screen.getByTitle("Notifications")).toBeInTheDocument();
  });

  it("shows the unread badge only when there are unread items", () => {
    const { rerender } = render(
      <NotificationBell notifications={[]} unreadCount={0} markRead={vi.fn()} markAllRead={vi.fn()} />);
    expect(screen.queryByText("3")).toBeNull();
    rerender(<NotificationBell notifications={[]} unreadCount={3} markRead={vi.fn()} markAllRead={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("caps the badge at 99+", () => {
    setup({ unreadCount: 250 });
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("is closed until the bell is clicked, then shows the panel", () => {
    setup();
    expect(screen.queryByText("No notifications")).toBeNull();
    openPanel();
    expect(screen.getByText("No notifications")).toBeInTheDocument();
  });

  it("toggles closed on a second click", () => {
    setup();
    openPanel();
    expect(screen.getByText("No notifications")).toBeInTheDocument();
    openPanel();
    expect(screen.queryByText("No notifications")).toBeNull();
  });

  it("renders notification titles and bodies when open", () => {
    setup({ notifications: [notif({ id: 1, title: "Unit understaffed", body: "Crew short" })], unreadCount: 1 });
    openPanel();
    expect(screen.getByText("Unit understaffed")).toBeInTheDocument();
    expect(screen.getByText("Crew short")).toBeInTheDocument();
  });

  it("shows Mark all read only when there are unread items and calls the handler", () => {
    const { markAllRead } = setup({ notifications: [notif()], unreadCount: 1 });
    openPanel();
    fireEvent.click(screen.getByText(/mark all read/i));
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it("marks an unread notification read on click", () => {
    const { markRead } = setup({ notifications: [notif({ id: 7, is_read: false })], unreadCount: 1 });
    openPanel();
    fireEvent.click(screen.getByText("New call today"));
    expect(markRead).toHaveBeenCalledWith(7);
  });

  it("does not re-mark an already-read notification", () => {
    const { markRead } = setup({ notifications: [notif({ id: 7, is_read: true })], unreadCount: 0 });
    openPanel();
    fireEvent.click(screen.getByText("New call today"));
    expect(markRead).not.toHaveBeenCalled();
  });
});
