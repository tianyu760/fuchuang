package com.fayi.backend.service;

import com.fayi.backend.dto.AuthResponse;
import com.fayi.backend.dto.ChangePasswordRequest;
import com.fayi.backend.dto.LoginRequest;
import com.fayi.backend.dto.RegisterRequest;
import com.fayi.backend.dto.UpdateProfileRequest;
import com.fayi.backend.dto.UserDto;
import com.fayi.backend.entity.User;
import com.fayi.backend.repository.UserRepository;
import com.fayi.backend.security.JwtUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private static final String DEFAULT_AVATAR = "./images/avatars/1.svg";
    private static final String DEFAULT_PERSONA = "life_consume";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    public AuthResponse register(RegisterRequest req) {
        String email = req.getEmail().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("该邮箱已注册，请直接登录。");
        }
        if (req.getPassword() == null || req.getPassword().length() < 6) {
            throw new IllegalArgumentException("密码长度至少 6 位。");
        }
        User user = new User();
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(req.getPassword()));
        user.setName(req.getName() != null ? req.getName().trim() : email);
        user.setAvatar(req.getAvatar() != null ? req.getAvatar() : DEFAULT_AVATAR);
        user.setPersona(req.getPersona() != null ? req.getPersona() : DEFAULT_PERSONA);
        userRepository.save(user);

        String token = jwtUtil.generateToken(email);
        return new AuthResponse(token, toDto(user));
    }

    public AuthResponse login(LoginRequest req) {
        String email = req.getEmail().trim().toLowerCase();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("邮箱或密码不正确。"));
        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("邮箱或密码不正确。");
        }
        String token = jwtUtil.generateToken(email);
        return new AuthResponse(token, toDto(user));
    }

    public UserDto getProfile(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("账号不存在"));
        return toDto(user);
    }

    public UserDto updateProfile(String email, UpdateProfileRequest req) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("账号不存在"));
        if (req.getName() != null) user.setName(req.getName().trim());
        if (req.getAvatar() != null) user.setAvatar(req.getAvatar());
        if (req.getPersona() != null) user.setPersona(req.getPersona());
        userRepository.save(user);
        return toDto(user);
    }

    public void changePassword(String email, ChangePasswordRequest req) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("账号不存在"));
        if (!passwordEncoder.matches(req.getOldPassword(), user.getPassword())) {
            throw new IllegalArgumentException("原密码不正确。");
        }
        if (req.getNewPassword() == null || req.getNewPassword().length() < 6) {
            throw new IllegalArgumentException("新密码长度至少 6 位。");
        }
        user.setPassword(passwordEncoder.encode(req.getNewPassword()));
        userRepository.save(user);
    }

    public User getUserEntity(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("账号不存在"));
    }

    /**
     * QQ OAuth 登录：若该 openId 已存在则直接登录，否则自动注册新账号
     */
    public AuthResponse loginOrRegisterByQq(String qqOpenId, String nickname, String avatarUrl) {
        Optional<User> existing = userRepository.findByQqOpenId(qqOpenId);
        User user;
        if (existing.isPresent()) {
            user = existing.get();
            // 同步最新昵称和头像
            if (nickname != null && !nickname.isBlank()) user.setName(nickname);
            if (avatarUrl != null && !avatarUrl.isBlank()) user.setAvatar(avatarUrl);
            userRepository.save(user);
        } else {
            // 首次登录：自动创建账号
            String syntheticEmail = "qq_" + qqOpenId + "@qq.fayi.local";
            user = new User();
            user.setEmail(syntheticEmail);
            user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
            user.setName(nickname != null ? nickname : "QQ用户");
            user.setAvatar(avatarUrl != null && !avatarUrl.isBlank() ? avatarUrl : DEFAULT_AVATAR);
            user.setPersona(DEFAULT_PERSONA);
            user.setQqOpenId(qqOpenId);
            userRepository.save(user);
        }
        String token = jwtUtil.generateToken(user.getEmail());
        return new AuthResponse(token, toDto(user));
    }

    public static UserDto toDto(User user) {
        return new UserDto(
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getAvatar(),
                user.getPersona()
        );
    }
}
