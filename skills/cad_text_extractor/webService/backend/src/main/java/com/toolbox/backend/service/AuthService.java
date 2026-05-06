package com.toolbox.backend.service;

import com.toolbox.backend.entity.User;
import com.toolbox.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    public User login(String username, String password) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            // Plaintext password check as requested
            if (user.getPassword().equals(password)) {
                return user;
            }
        }
        return null;
    }
}
