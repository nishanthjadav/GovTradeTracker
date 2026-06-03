package com.politicaltrades.politicaltrades.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "politicians")
public class Politician {

    @Id
    @Column(name = "id", nullable = false)
    private String id; 
    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "party")
    private String party; 

    @Column(name = "chamber")
    private String chamber; 

    @Column(name = "state")
    private String state; 

    public Politician() {}

    public Politician(String id, String name, String party, String chamber, String state) {
        this.id = id;
        this.name = name;
        this.party = party;
        this.chamber = chamber;
        this.state = state;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getParty() { return party; }
    public void setParty(String party) { this.party = party; }

    public String getChamber() { return chamber; }
    public void setChamber(String chamber) { this.chamber = chamber; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
}
