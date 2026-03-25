"use client";

import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/auth-store";
import { toast } from "sonner";
import { User, Shield, Palette, Moon, Sun } from "lucide-react";

export default function AdminSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const displayName = user?.displayName || user?.email || "Admin";
  const email = user?.email || "";

  const [profileForm, setProfileForm] = useState({ displayName, avatarUrl: "" });
  const [passwordForm, setPasswordForm] = useState({ current: "", newPass: "", confirm: "" });
  const [isDark, setIsDark] = useState(false);

  const saveProfile = () => {
    toast.success("Profile updated successfully");
  };

  const savePassword = () => {
    if (passwordForm.newPass !== passwordForm.confirm) { toast.error("Passwords do not match"); return; }
    if (passwordForm.newPass.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    toast.success("Password updated successfully");
    setPasswordForm({ current: "", newPass: "", confirm: "" });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Settings" description="Manage your account and preferences" />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-card shadow-sm border-0 p-1">
          <TabsTrigger value="profile" className="flex items-center gap-2 cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><User className="w-4 h-4" />Profile</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2 cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Shield className="w-4 h-4" />Security</TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2 cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Palette className="w-4 h-4" />Appearance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading">Profile Information</CardTitle>
              <CardDescription>Update your account details and avatar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 ring-4 ring-primary/10">
                  <AvatarImage src={profileForm.avatarUrl || undefined} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-lg font-semibold">{profileForm.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">{profileForm.displayName}</p>
                  <p className="text-xs text-muted-foreground">Administrator</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2"><Label>Display Name</Label><Input value={profileForm.displayName} onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={email} disabled className="bg-muted" /><p className="text-xs text-muted-foreground">Email cannot be changed</p></div>
              <div className="space-y-2"><Label>Avatar URL</Label><Input value={profileForm.avatarUrl} onChange={(e) => setProfileForm((f) => ({ ...f, avatarUrl: e.target.value }))} /></div>
              <Button onClick={saveProfile} className="cursor-pointer">Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="font-heading">Change Password</CardTitle><CardDescription>Update your password to keep your account secure</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Current Password</Label><Input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))} /></div>
              <div className="space-y-2"><Label>New Password</Label><Input type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm((f) => ({ ...f, newPass: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Confirm New Password</Label><Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))} /></div>
              <Separator />
              <Button onClick={savePassword} className="cursor-pointer">Update Password</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="font-heading">Theme</CardTitle><CardDescription>Choose your preferred color scheme</CardDescription></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    {isDark ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Dark Mode</p>
                    <p className="text-xs text-muted-foreground">
                      {isDark ? "Dark theme is active" : "Switch to dark theme for reduced eye strain"}
                    </p>
                  </div>
                </div>
                <Switch checked={isDark} onCheckedChange={setIsDark} className="cursor-pointer" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
