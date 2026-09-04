const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const UserModel = require("../user/user.model");

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
        proxy: true, 
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0].value;

          let user = await UserModel.findOne({ email: email });

          if (user) {
            if (!user.googleId) {
              user.googleId = profile.id;
              await user.save();
            }
            return done(null, user);
          }

          user = await UserModel.create({
            fullname: profile.displayName || "Google User",
            email: email,
            googleId: profile.id,
            authProvider: "google",
          });

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      },
    ),
  );
}

if (process.env.GITHUB_CLIENT_ID) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: "/api/auth/github/callback",
        scope: ["user:email"], 
        proxy: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;

          if (!email) {
            email = `${profile.username}@github.com`;
          }

          let user = await UserModel.findOne({ email: email });

          if (user) {
            if (!user.githubId) {
              user.githubId = profile.id;
              await user.save();
            }
            return done(null, user);
          }

          user = await UserModel.create({
            fullname: profile.displayName || profile.username || "GitHub User",
            email: email,
            githubId: profile.id,
            authProvider: "github",
          });

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      },
    ),
  );
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
