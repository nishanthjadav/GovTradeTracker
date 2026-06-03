package com.politicaltrades.politicaltrades.repository;

import com.politicaltrades.politicaltrades.entity.Politician;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PoliticianRepository extends JpaRepository<Politician, String> {
}
