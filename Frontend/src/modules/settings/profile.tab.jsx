import { useState, useEffect } from "react";
import { useAuth } from "../auth/auth.hook";
import { api } from "../../shared/api/client";
import toast from "react-hot-toast";
import { getApiErrorMessage } from "../../shared/utils/apiError";

const ProfileTab = () => {
  const { token } = useAuth();

  const [formData, setFormData] = useState({
    fullname: "",
    email: "",
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get(`/api/users/profile`);

        setFormData({
          fullname: response.data.fullname,
          email: response.data.email,
        });
      } catch (error) {
        console.error("Failed to fetch profile", error);
      }
    };

    if (token) fetchProfile();
  }, [token]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await api.put(`/api/users/profile`, {
        fullname: formData.fullname,
      });

      toast.success("Profile updated successfully!", {
        style: {
          background: "#18181b",
          color: "#fff",
        },
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update profile."), {
        style: {
          background: "#18181b",
          color: "#fff",
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-6 mb-8">
        <img
          src={`https://ui-avatars.com/api/?name=${formData.fullname || "User"}&background=155dfc&color=fff&size=100`}
          alt="Profile"
          className="w-24 h-24 rounded-full shadow-lg"
        />
        <div>
          <h1 className="text-2xl font-bold text-neutral-50">Account Details</h1>
          <p className="text-secondary-text mt-1">Manage your profile details and security.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-secondary-text mb-2">Full Name</label>
          <input
            type="text"
            name="fullname"
            value={formData.fullname}
            onChange={handleChange}
            className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-secondary-text mb-2">Email Address</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            disabled
            readOnly
            className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-secondary-text cursor-not-allowed"
          />
          <p className="text-xs text-secondary-text mt-2">
            Your email is verified and can't be changed here.
          </p>
        </div>

        <div className="pt-4">
          <h3 className="text-lg font-semibold text-neutral-50 mb-2">Security</h3>
          <p className="text-sm text-secondary-text leading-relaxed">
            This account has no password. You sign in with Google, GitHub, or a one-time code
            sent to your email address.
          </p>
        </div>

        <div className="pt-6">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-accent hover:opacity-90 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-lg disabled:opacity-50"
          >
            {isLoading ? "Saving Changes..." : "Save Profile"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileTab;
