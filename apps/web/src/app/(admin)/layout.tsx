export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <nav className="flex gap-6 text-sm text-gray-300">
            <a href="/admin-dashboard" className="hover:text-white">Dashboard</a>
            <a href="/admin-tests" className="hover:text-white">Tests</a>
            <a href="/admin-import" className="hover:text-white">Import</a>
            <a href="/admin-users" className="hover:text-white">Users</a>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
