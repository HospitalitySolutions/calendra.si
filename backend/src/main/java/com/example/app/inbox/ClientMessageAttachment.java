package com.example.app.inbox;

import com.example.app.common.BaseEntity;
import com.example.app.files.ClientFile;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "client_message_attachments",
        uniqueConstraints = @UniqueConstraint(columnNames = {"message_id", "client_file_id"})
)
public class ClientMessageAttachment extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    private ClientMessage message;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "client_file_id", nullable = false)
    private ClientFile clientFile;
}
